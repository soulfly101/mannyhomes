# Altheo Homes

Apartment management system for Altheo Homes: tenants register, see prices, book an apartment, pay the deposit, rent and sanitation fee (Paystack: Mobile Money and card), report problems and book cleaning. The property manager tracks everything from a dashboard.

Built with Next.js (App Router), PostgreSQL and Prisma.

## Run it locally

You need Node.js 20 or newer. PostgreSQL runs from `node_modules`, so nothing else has to be installed.

1. Install packages:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and set `AUTH_SECRET` (the file shows how to generate one).

3. Start the database and leave it running in its own terminal:

   ```bash
   npm run db
   ```

4. Create the tables and load sample data (first time only):

   ```bash
   npm run db:migrate
   npm run db:seed
   ```

5. Start the app and open http://localhost:3000:

   ```bash
   npm run dev
   ```

Without Paystack keys in `.env`, payments go through a test checkout page where you choose whether the payment succeeds or fails; no money moves. With Paystack test keys set, the real Paystack checkout is used. Point the Paystack webhook at `/api/paystack/webhook`.

The test accounts (manager, technician and tenant) and their password are listed at the top of `prisma/seed.ts`.

## Where things are

| Path | What it is |
|---|---|
| `app/page.tsx` | Public front page |
| `app/units/[id]` | Apartment details; price shown only after login |
| `app/(auth)` | Login, sign-up and log-out |
| `app/tenant`, `app/manager`, `app/staff` | Areas for each kind of user |
| `lib/units.ts` | Apartment queries; prices are only read for logged-in users |
| `lib/auth.ts`, `lib/session.ts`, `middleware.ts` | Sessions and who can open which area |
| `lib/settings.ts` | Prices the admin controls (booking deposit, sanitation fee, cleaning) |
| `prisma/schema.prisma` | Database tables |
| `prisma/seed.ts` | Sample building: 3 floors, 10 apartments |
