# Running Altheo Homes on the server

The backend and MySQL run on the Oracle Always Free server (`altheo-server`, Arm, Oracle Linux 9) with
Docker Compose, using [`compose.prod.yml`](compose.prod.yml). HTTPS (#29), backups (#30), automatic deploys
(#31) and the website on Cloudflare Pages (#32) build on this.

## What runs

| Container | What | Reachable from |
|---|---|---|
| `altheo-db-1` | MySQL 8.4. Data in the Docker volume `altheo_mysql-data`. | The backend only |
| `altheo-backend-1` | The FastAPI app. Runs database migrations every time it starts. | The server itself, `127.0.0.1:8000`, until Caddy (#29) |

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
docker compose -f deploy/compose.prod.yml --env-file deploy/.env ps   # both "healthy"
```

Create the first admin account. Use your own details; it asks for the password without showing it:

```sh
docker compose -f deploy/compose.prod.yml --env-file deploy/.env exec backend \
  python -m app.cli create-user --role admin --email you@example.com --name "Your Name" --phone 0241234567
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
- Open port 8000 or 3306 to the internet. Only 80 and 443 (for Caddy, #29) should ever be opened.

## Logs

```sh
docker compose -f deploy/compose.prod.yml --env-file deploy/.env logs -f backend
```
