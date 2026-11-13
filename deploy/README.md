# Running Altheo Homes on the server

The backend and MySQL run on the Oracle Always Free server (`altheo-server`, Arm, Oracle Linux 9) with
Docker Compose, using [`compose.prod.yml`](compose.prod.yml), with Caddy in front for HTTPS (#29) and nightly
backups to Oracle Object Storage (#30). Automatic deploys (#31) and the website on Cloudflare Pages (#32) build
on this.

The API is at **https://89-168-66-187.sslip.io/api/health**. sslip.io is a free name that points back at the
IP inside it, so there's nothing to register; switch `API_HOST` to a real domain once there is one.

## What runs

| Container | What | Reachable from |
|---|---|---|
| `altheo-db-1` | MySQL 8.4. Data in the Docker volume `altheo_mysql-data`. | The backend only |
| `altheo-backend-1` | The FastAPI app. Runs database migrations every time it starts. | Caddy, and the server itself on `127.0.0.1:8000` |
| `altheo-backup-1` | Nightly database backups at 02:00 Ghana time ([`backup/backup.sh`](backup/backup.sh)), copied to Object Storage. The newest 7 also stay in the volume `altheo_backups`. | Nothing; it only reaches the database and Object Storage |
| `altheo-caddy-1` | HTTPS. Gets and renews a Let's Encrypt certificate by itself, sends HTTP to HTTPS, and passes `/api/*` to the backend (anything else is a 404). Certificates in the volume `altheo_caddy-data`. Settings in [`Caddyfile`](Caddyfile). | The internet, ports 80 and 443 |

Both restart by themselves after a crash or a server reboot (`restart: unless-stopped`; Docker starts on boot).

## Settings and secrets

`deploy/.env` on the server holds the passwords and keys. It is git-ignored and must never be committed or
pasted anywhere. `deploy/make-env.sh` creates it with fresh random MySQL passwords and app secret, readable by
the `opc` user only. Payment (Moolre, Paystack) and text (Moolre SMS) keys are added to it by hand later.
Until they're there, payments and texts are simply off.

## First install (done once)

```sh
ssh -i ~/.ssh/altheo_oracle opc@89.168.66.187
sudo mkdir -p /srv/altheo && sudo chown opc:opc /srv/altheo
git clone https://github.com/soulfly101/mannyhomes.git /srv/altheo
cd /srv/altheo
deploy/make-env.sh
docker compose -f deploy/compose.prod.yml --env-file deploy/.env up -d --build
```

The first build takes a few minutes. Then check it:

```sh
curl -s http://127.0.0.1:8000/api/health      # {"status":"ok"}
curl -s http://127.0.0.1:8000/api/health/db   # {"database":"ok"}
docker compose -f deploy/compose.prod.yml --env-file deploy/.env ps   # db and backend "healthy", caddy "Up"
```

Create the first admin account. Use your own details; it asks for the password without showing it:

```sh
docker compose -f deploy/compose.prod.yml --env-file deploy/.env exec backend \
  python -m app.cli create-user --role admin --email you@example.com --name "Your Name" --phone 0241234567
```

## Opening the web ports (done once)

The internet reaches the server only through ports the Oracle security list **and** the server's firewall
both allow. 22 (SSH) was open from the start; HTTPS needs 80 and 443, and nothing else should ever be added.

1. Oracle console → Networking → Virtual cloud networks → `altheo-vcn` → Security → the default security list
   → Security rules → Add ingress rules. Add two rules, each with source CIDR `0.0.0.0/0`, IP protocol TCP,
   destination port `80` and then `443`.
2. On the server:

   ```sh
   sudo firewall-cmd --permanent --add-service=http --add-service=https
   sudo firewall-cmd --reload
   ```

Caddy asks Let's Encrypt for the certificate as soon as both are open; `logs caddy` shows "certificate obtained".
Check from any computer: `curl -I http://89-168-66-187.sslip.io/api/health` answers `308` to `https://`, and
`curl https://89-168-66-187.sslip.io/api/health` gives `{"status":"ok"}`.

Payment webhooks then go to `https://89-168-66-187.sslip.io/api/webhooks/paystack` (Paystack dashboard →
Settings → API Keys & Webhooks) and `https://89-168-66-187.sslip.io/api/webhooks/moolre` (Moolre).

## Backups (#30)

Every night at 02:00 (UTC, which is Ghana time) the `backup` container dumps the database with `mysqldump`,
checks the dump is complete, and copies it to the Object Storage bucket `altheo-backups`: `daily/<name>` every
night, and also `weekly/<name>` on Sundays. The bucket's lifecycle rules delete daily copies after 14 days and
weekly ones after 56 days (8 weeks). The server can only **add** files to the bucket, never read or delete
them, so even someone who broke into the server couldn't wipe the backups.

Every try is recorded in the `backup_runs` table, and the admin dashboard (`/admin`) shows a **Database
backups** warning if the last one failed, was only kept on the server, or hasn't run for over a day.
`logs backup` shows the details.

### Setting up the bucket (done once, in the Oracle console)

1. **Storage → Buckets → Create Bucket.** Name `altheo-backups`, Standard tier, everything else as it is
   (private, encrypted by Oracle).
2. **Identity & Security → Policies → Create Policy**, in the root compartment. Name `object-storage-lifecycle`,
   "Show manual editor", statement:
   `Allow service objectstorage-eu-frankfurt-1 to manage object-family in tenancy`
   (lifecycle rules can't delete anything without it).
3. In the bucket, **Lifecycle Policy Rules → Create Rule** twice:
   - `delete-old-daily`: Delete, after 14 days, object name prefix `daily/`.
   - `delete-old-weekly`: Delete, after 56 days, object name prefix `weekly/`.
4. In the bucket, **Pre-Authenticated Requests → Create**. Name `altheo-server-upload`, target **Bucket**,
   access **Permit object writes**, expiry a few years ahead. Copy the URL straight away (it's only shown
   once). It's a password: never paste it into chat, email or git.
5. On the server, put it in `deploy/.env`:

   ```sh
   nano /srv/altheo/deploy/.env          # BACKUP_UPLOAD_URL=<the URL, ending in /o/>
   docker compose -f deploy/compose.prod.yml --env-file deploy/.env up -d backup
   ```

### Running one now and checking it

```sh
docker compose -f deploy/compose.prod.yml --env-file deploy/.env exec backup sh /backup/backup.sh once
docker compose -f deploy/compose.prod.yml --env-file deploy/.env exec backup ls -l /backups
```

It ends with "copied … to Object Storage", and the file appears under `daily/` in the bucket.

### Checking a backup restores (do this now and then)

```sh
deploy/backup/restore.sh altheo-2026-11-14T0200Z.sql.gz altheo_restore_test   # a name from /backups
docker compose -f deploy/compose.prod.yml --env-file deploy/.env exec db \
  sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -e "DROP DATABASE altheo_restore_test"'
```

It restores into a new, separate database and prints how many tables it has and its migration; the live
database isn't touched. For a copy from Object Storage (e.g. after losing the server), download it in the
console (the object's ⋯ → Download), copy it up with
`scp -i ~/.ssh/altheo_oracle altheo-….sql.gz opc@89.168.66.187:/tmp/` and pass `/tmp/altheo-….sql.gz` instead.

### Restoring the live database

Only to undo a disaster: everything written since that backup is lost.

```sh
docker compose -f deploy/compose.prod.yml --env-file deploy/.env stop backend
REPLACE_LIVE_DATABASE=yes deploy/backup/restore.sh <backup> altheo
docker compose -f deploy/compose.prod.yml --env-file deploy/.env start backend   # runs any newer migrations
```

## Updating to the latest `main`

Until automatic deploys (#31) exist:

```sh
cd /srv/altheo
git pull
docker compose -f deploy/compose.prod.yml --env-file deploy/.env up -d --build
```

Migrations run as the new backend starts. The database volume is untouched.

## After changing deploy/.env

```sh
docker compose -f deploy/compose.prod.yml --env-file deploy/.env up -d
```

## Things never to do

- `docker compose ... down -v` or `docker volume rm altheo_mysql-data`: the `-v` deletes the database.
- Run `deploy/make-env.sh` again or change `MYSQL_PASSWORD` in `deploy/.env` once the database exists. MySQL
  keeps the password it was first created with, so the app would be locked out.
- Open port 8000 or 3306 to the internet. Only 80 and 443 (Caddy) are open, besides SSH.
- Make the backup link (pre-authenticated request) able to read or list the bucket. Writes only.
- `docker volume rm altheo_caddy-data`: Caddy would have to ask Let's Encrypt again, which limits how often
  it hands out certificates.

## Logs

```sh
docker compose -f deploy/compose.prod.yml --env-file deploy/.env logs -f backend
docker compose -f deploy/compose.prod.yml --env-file deploy/.env logs -f caddy    # requests and certificates
docker compose -f deploy/compose.prod.yml --env-file deploy/.env logs backup     # nightly backups
```
