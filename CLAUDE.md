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
All UI follows **[DESIGN.md](DESIGN.md)**: **warm and friendly with real motion (photos come in from the sides on scroll via `<Reveal>` and pop out on hover via `photoPop`), and no gradients, glow, blur or glass.** New UI uses **Tailwind CSS + shadcn**: primitives in `frontend/src/components/ui/` (shadcn installs there, per `frontend/components.json`), import via the `@/` alias, merge classes with `cn()` from `@/lib/utils`, and use the theme colours from `frontend/src/styles/globals.css` (never hard-coded colours). Components from 21st.dev/shadcn must be adapted to this style before use, and the site never shows made-up people or testimonials. If something new is needed, add it to DESIGN.md and the shared components first.

## Running
```bash
make up        # MySQL + backend (:8000) + frontend (:5173) in Docker; creates .env files on first run
make test      # backend + frontend tests inside the containers (backend tests use a separate `altheo_test` database)
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
- Public pages: home `/` (`frontend/src/landing/`, with a 3-residence preview), `/residences` (list), `/residences/:id` (one room type) and `/book/:id` (booking, tenants only) in `frontend/src/residences/`. Keep each flow on its own page rather than adding to the home page. Copy, photos, facilities, map areas and contact details live in `frontend/src/landing/content.ts`. A single room type comes from `GET /api/listings/rooms/{id}`. Contact form messages go to `POST /api/contact` and admins read them at `GET /api/admin/contact`.
- Room types also carry a `booking_deposit` (paid when booking, #14) and a `renting_deposit` (charged at allocation, #18); 0 means "not set yet".
- Prices on a room type are the **current offer only**. Anything that charges money later (bookings, tenancies, bills) must **copy** the amount when it's created, so editing prices never changes what someone already owes.
## Money (bills and payments)
- `bills` (booking deposit, renting deposit, monthly sanitation) and `payments` live in `backend/src/app/billing/`. Always create and pay bills through `billing/service.py` (`create_bill`, `record_payment`, `mark_payment`, `void_bill`), never by writing the tables directly.
- A bill's status (Paid / Partial / Unpaid) is **derived** from its successful payments, never stored. Cancelled (voided) bills are ignored.
- Every payment has a **unique reference** (Paystack's, or `manual-…` for cash/bank), so a repeated webhook or double click can't count money twice. Overpaying a bill is refused.
- A tenant is **fully compliant** for a month only when the booking deposit, renting deposit and that month's sanitation bill are all Paid; a missing bill counts as not cleared (`tenant_compliance`).
- APIs: `GET /api/me/bills`, `GET /api/admin/bills`, `POST /api/admin/bills/{id}/payments` (cash/bank), `GET /api/admin/tenants/{id}/compliance?period=YYYY-MM`.

## Booking and payments
- `POST /api/bookings` → `POST /api/bookings/{id}/pay` → the prompt on the tenant's phone → status `awaiting_allocation` (`backend/src/app/bookings/`). Pages: `/book/:roomTypeId`, `/bookings/:id`, `/bookings`, and `/dashboard` (a tenant's home base; where they land after logging in with no `next`).
- One open booking per tenant. Paid bookings hold a room, and unpaid ones hold it for 10 minutes, so listings show `quantity_available` minus holds; the tenant's own unpaid hold isn't counted against them. `quantity_available` itself still only changes at allocation and move-out.
- Gateways live in `backend/src/app/payments/gateway.py` behind `PaymentGateway`; add a provider there (e.g. Korba) without touching bookings. `get_gateway()` picks Paystack when `PAYSTACK_SECRET_KEY` is set; **without a key, pretend payments work only when `APP_ENV=development`** (docker compose sets it; the default is production, where payments are simply off).
- `POST /api/webhooks/paystack` needs no CSRF header; it checks the `x-paystack-signature` HMAC instead. The page also asks Paystack directly while waiting, so a missed webhook isn't fatal. A confirmation only counts if the amount and currency match, and if money really arrived it counts even after a timeout or cancellation.

## Allocation and tenancies
- `/admin/allocations` is the queue of paid bookings (longest wait first); `/admin/allocations/:bookingId` assigns the room (`backend/src/app/allocations/`, `GET`/`POST /api/admin/allocations…`).
- `allocate()` does it all in one transaction: `quantity_available` −1, a renting deposit bill (due in 7 days), a `tenancies` row with rent and sanitation **copied**, booking status `allocated`.
- The room number is typed by the admin; one active tenancy per room in a building, ignoring case. A tenancy with `ended_at` set (move-out, #26) frees the room, and #26 must also add 1 back to `quantity_available`.
- Allocation is refused, with the reason shown to the admin, if the room type has no renting deposit set, has no rooms left, or was deleted.

## Admin dashboard
- `/admin` (`frontend/src/admin/AdminDashboardPage.tsx`) reads `GET /api/admin/overview?months=` (`backend/src/app/overview/`). Every number comes from real records; with nothing yet it says so rather than showing sample figures. Admins land there after logging in with no `next`.
- The admin area has a dark/light toggle (`AdminLayout`): dark at first, remembered per browser, and removed on leaving the admin area, so public pages keep following the device. It sets `data-theme` on `<html>`; `globals.css` and `tokens.css` each hold the dark colours twice, which must stay identical (a test checks this).

## Tenancy agreements
- `backend/src/app/agreements/`. **The wording in `template.py` is a DRAFT placeholder**: every document says so until a lawyer approves or replaces it and `DRAFT_WORDING` is set to False. Don't let real tenants sign it before then.
- Created in the same transaction as the allocation, so an admin needs a signature first (`/admin/signature`). The wording, dates and landlord's signature are frozen on the agreement; later changes never touch it. It can only be signed once.
- Signature images must be real PNGs under 500 KB (`check_signature_image`); wording renders as text, never HTML.
- **The renting deposit can't be paid online until the agreement is signed** (`payment_block`). Bills are paid at `/api/me/bills/{id}/pay` (`/bills/:id/pay`), which #16 can reuse for sanitation.
- Pages: `/agreements/:id` (tenant), `/admin/agreements`, `/admin/signature`. PDFs come from the browser's print button.

- Monthly sanitation bills (#16, `app/sanitation/`) follow each tenant's move-in date: the admin's date at `/admin/tenants`, otherwise the day they signed. Each bill is the full fee for a month starting that day, so there's no part-month charge. There's no scheduler: `ensure_sanitation_bills` creates missing bills whenever bills are read, so call it anywhere that reads them.
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
