# Running Altheo Homes on the server

The backend and MySQL run on the Oracle Always Free server (`altheo-server`, Arm, Oracle Linux 9) with
Docker Compose, using [`compose.prod.yml`](compose.prod.yml), with Caddy in front for HTTPS (#29). Backups
(#30), automatic deploys (#31) and the website on Cloudflare Pages (#32) build on this.

The API is at **https://89-168-66-187.sslip.io/api/health**. sslip.io is a free name that points back at the
IP inside it, so there's nothing to register; switch `API_HOST` to a real domain once there is one.

## What runs

| Container | What | Reachable from |
|---|---|---|
| `altheo-db-1` | MySQL 8.4. Data in the Docker volume `altheo_mysql-data`. | The backend only |
| `altheo-backend-1` | The FastAPI app. Runs database migrations every time it starts. | Caddy, and the server itself on `127.0.0.1:8000` |
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
- `docker volume rm altheo_caddy-data`: Caddy would have to ask Let's Encrypt again, which limits how often
  it hands out certificates.

## Logs

```sh
docker compose -f deploy/compose.prod.yml --env-file deploy/.env logs -f backend
docker compose -f deploy/compose.prod.yml --env-file deploy/.env logs -f caddy   # requests and certificates
```
