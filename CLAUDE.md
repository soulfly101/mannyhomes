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

## Running
```bash
make up        # MySQL + backend (:8000) + frontend (:5173) in Docker; creates .env files on first run
make test      # backend + frontend tests inside the containers
make lint      # ruff + TypeScript typecheck
make down
```
Without Docker: `cd backend && uv run pytest`, `cd frontend && npm test`.
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
