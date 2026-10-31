# Altheo Homes

Web app for **Altheo Homes**, a company that rents out apartments in several apartment complexes in Ghana (Accra, East Legon, Tema, …).

- **Tenants** browse complexes and their apartment types, see prices after signing up, book an apartment type with a refundable booking deposit, pay rent and fees, report repairs and book cleaning.
- **The property manager** approves bookings, assigns the exact unit, tracks bills, payments and refunds, manages complexes, apartment types, units and prices, and runs repairs.
- **Technicians (staff)** see and update the repair jobs assigned to them.
- Payments go through **Paystack** (Mobile Money and card). Money is **whole Ghana cedis (GH₵)**, stored as integers.
- Prices are only shown to logged-in users.

## Stack and layout
| Folder | What |
|---|---|
| `backend/` | FastAPI on **Python 3.14**, SQLAlchemy 2 + PyMySQL, settings via pydantic-settings. Code in `backend/src/app/`, tests in `backend/tests/` (pytest). Dependencies managed with **uv** (`pyproject.toml` + `uv.lock`). |
| `frontend/` | React 19 + TypeScript, built with Vite. Code in `frontend/src/`, tests in `frontend/tests/` (jest + Testing Library). |
| MySQL 8.4 | Runs in docker compose; data in `./.mysql-data/` (git-ignored). |
| `legacy/` | The first version of the app (Next.js + Prisma + PostgreSQL). **Reference only**: features are ported from it into `backend/` + `frontend/` one Trello card at a time, then it gets deleted. Don't add features to it. |

## Design
All UI follows **[DESIGN.md](DESIGN.md)** (the "Calm glass" look): colours, type, spacing, components, status pills and accessibility rules. Build screens from the shared components in `frontend/src/components/` and the tokens in `frontend/src/styles/tokens.css`; never hard-code colours or restyle components per page. If something new is needed, add it to DESIGN.md and the shared components first.

## Running
```bash
make up        # MySQL + backend (:8000) + frontend (:5173) in Docker; creates .env files on first run
make test      # backend + frontend tests inside the containers
make lint      # ruff + TypeScript typecheck
make down
```
Without Docker: `cd backend && uv run pytest`, `cd frontend && npm test`.

Database changes go through **Alembic** migrations in `backend/migrations/versions/` (they run automatically when the backend starts; `make migrate` runs them by hand). Never change tables any other way. `make create-admin` creates an admin account.

## Accounts and login
- Roles: `tenant` (public sign-up), `admin` and `staff` (created by an admin, for now with `make create-admin` / `python -m app.cli create-user`).
- Sessions are server-side (`sessions` table) with an HttpOnly cookie; protect routes with `Depends(current_user)` or `Depends(require_role(Role.ADMIN))` from `app.auth.deps`.
- Every POST/PATCH/PUT/DELETE to `/api/*` must send the header `X-Requested-With: altheo`; the frontend's `apiFetch()` does this. Use `apiFetch` for all API calls.
- Phone numbers are stored as `+233XXXXXXXXX`; money as whole cedis.

## Inventory and prices
- `buildings` → `room_types` (e.g. "Manny Building" → "2 bedroom": rent, `quantity_available`, optional sanitation fee override). Admin API at `/api/admin/buildings`, admin screens at `/admin/buildings`.
- `quantity_available` is the count tenants see. Allocation (#18) must subtract 1 and move-out (#26) add 1 back, in the same transaction as the allocation/move-out.
- Prices on a room type are the **current offer only**. Anything that charges money later (bookings, tenancies, bills) must **copy** the amount when it's created, so editing prices never changes what someone already owes.
Settings live in `.env` files (copied from the `.env.example` next to them). Never commit a `.env`.

## Rules
- **Tests are mandatory for any new code**: unit, e2e or both. A change without tests isn't done.
- **Always start new work from a freshly synced `main`** (`git switch main && git pull`), on a branch named:
  - `feature/<short_description>` for feature work
  - `fix/<short_description>` for bug fixes
  - `chore/<short_description>` for anything else
- `main` is protected: every change goes through a pull request (squash-merged). CI (`.github/workflows/tests.yml`) runs backend, frontend and Docker checks on every PR and on merge.
- **Trello**: if the work is tied to a ticket on the "Altheo Aparment management" board, mention the ticket (link) in the PR description, and move the card as work progresses: **In Progress** when you start → **In Review** when the PR is open → **Done** when it's merged.
- Keep `docs/` (business documents, proposal and pricing) out of git; the repo is public.
