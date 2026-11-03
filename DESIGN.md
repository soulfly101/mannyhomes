# Altheo Homes design rules

**Direction: professional and flat, after the "Solenne" reference the owner chose.** Warm cream surfaces, dark ink text, solid deep-navy buttons with small corners, elegant serif headings, small uppercase eyebrow labels, thin borders, and real photos or video of the buildings. **No gradient colouring, glow, blurred colour blobs or frosted glass** (the earlier "Calm glass" look was dropped on 3 Nov 2026).

New screens are built with **Tailwind CSS** and **shadcn**-style components:
- Primitives live in `frontend/src/components/ui/` (shadcn installs there; see `frontend/components.json`), app components in `frontend/src/components/`.
- Import with the `@/` alias (`@/components/ui/badge`, `@/lib/utils`), and combine classes with `cn()`.
- Colours come from the theme variables in `frontend/src/styles/globals.css` (`bg-background`, `text-foreground`, `bg-primary`, `text-muted-foreground`, `border-border`, `text-destructive`, `text-success`, …). Never hard-code colours.
- Components taken from 21st.dev or shadcn are adapted before use: strip gradients, blur, glow and off-brand accents (e.g. violet), and never show made-up people or testimonials.

Older screens (admin buildings, status) still use the plain-CSS classes in `frontend/src/styles/components.css`, now flat (solid cards, no blur). Move them to Tailwind when they're next changed.

## Principles
1. **Professional.** Calm, solid colours, generous space, one strong action per screen.
2. **Readable first.** Text sits on solid surfaces or a solid dark overlay over photos, never a gradient. WCAG AA contrast in light and dark mode.
3. **Money is unmistakable.** Amounts, due dates and payment states are the clearest things on any screen that shows them.
4. **Phone first.** Most tenants pay and report problems from a phone on mobile data. Design at 360px wide, then scale up.

## Colour
All colours are CSS variables in `frontend/src/styles/tokens.css`, with light and dark values. Never write a hex code in a component.

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` / `--bg` | `#F4EFE7` (cream) | `#12161C` | Page background |
| `foreground` / `--fg` | `#1C232B` (ink) | `#EEE8DE` | Main text, headings |
| `muted-foreground` / `--muted` | `#5B636D` | `#A7AFB8` | Secondary text, labels |
| `primary` / `--accent` | `#1F2E3D` (deep navy) | `#E9DFCF` | Buttons, selected chips, focus (solid) |
| `primary-foreground` | `#F7F3EC` | `#12161C` | Text on primary |
| `card` / `--glass` | `#FBF8F3` | `#1A2028` | Cards, form fields, footer (solid) |
| `border` / `--line` | `#DDD4C6` | `#2E3742` | Borders, dividers |
| `overlay` | ink at 45% | ink at 55% | **Solid** layer over photos/video so white text is readable |
| `--ok` / `--ok-bg` | `#0F7B5F` | `#5FD3AE` | Paid, free, resolved, success |
| `--warn` / `--warn-bg` | `#9A5B00` | `#F4C063` | Partial, pending, awaiting, booked |
| `--danger` / `--danger-bg` | `#B42F2F` | `#FF8A8A` | Unpaid, overdue, errors, destructive actions |
| `--info-bg` | blue 12% | blue 14% | Neutral highlights, "in progress" |

- Blue means "you can act on this". Don't use it for decoration or status.
- Green, amber and red are **only** for status (see Status pills), never for decoration.
- Dark mode follows the phone or computer setting automatically. Check every screen in both.

## Type
- **Headings:** Cormorant Garamond (serif, weight 500, `font-serif`), large and airy like the reference. **Body and UI:** Figtree (variable). Both are bundled with the app (`@fontsource/*`), not loaded from Google.
- **Eyebrows:** 12px uppercase, wide letter spacing, with a small dot (`Eyebrow` in `frontend/src/landing/parts.tsx`).

| Style | Size | Weight | Use |
|---|---|---|---|
| Display | `clamp(2.2rem, 6vw, 4rem)` | 600 | Home page hero only |
| H1 | `clamp(1.75rem, 4vw, 2.5rem)` | 600 | One per page |
| H2 | `1.4rem` | 600 | Section titles |
| H3 | `1.15rem` | 600 | Card titles |
| Body | `1rem` (16px) | 400 | Everything else |
| Small | `0.875rem` | 400–500 | Labels, metadata, helper text |
| Amount | `1.4rem`, `tabular-nums` | 600 | Prices and money owed |

- Line height 1.55 for body text, 1.15 for headings.
- Sentence case everywhere: "Book now", "Pending allocations", never "Book Now".
- Money is always `GH₵ 1,200`: the symbol, a space, comma thousands, no decimals (amounts are whole cedis). Use `formatCedis()` in `frontend/src/format.ts`.
- Dates read like `31 Oct 2026` in the Africa/Accra timezone.

## Space, shape and depth
- **Spacing scale:** 4, 8, 12, 16, 24, 32, 48, 72 px (`--space-1` … `--space-8`). Page side padding is 16px on phones, 24px from 768px.
- **Max content width:** 1120px, centred.
- **Corner radius:** pills and buttons `999px`; cards `22px`; large panels and hero sections `28px`; fields `14px`.
- **Surfaces:** solid `card` background, 1px `border`, small shadow at most. No `backdrop-filter`, no translucent glass.
- **Background:** plain `background` colour. Photos and video (landing hero, sign-in/sign-up) sit under a **solid** dark overlay when text is on top, never a gradient scrim.
- **Shadows:** `shadow-sm` on cards at most; nothing glows.

## Components
Use the shared components. Each has tests in `frontend/tests/components/`.

### Sign in, sign up and onboarding (`@/components/ui/sign-in`, `@/components/ui/sign-up`)
Two columns: form on the left, apartment photo on the right (photo hidden on phones). Built from `AuthSplitLayout`, `AuthField` (labelled, hint and error linked for screen readers, optional show/hide password), `SubmitButton` (busy state), `GoogleButton` and `FormError`.

### Landing page (`frontend/src/landing/`)
Hero (video/photo + menu), the Altheo experience, Find your residence (live room types accordion), Facilities, Location (Leaflet map with light OpenStreetMap/CARTO tiles), Gallery, call to action, and footer with the contact form. **All copy, photos, facilities, locations and contact details are in `frontend/src/landing/content.ts`**; buildings, prices and availability come live from the admin inventory.

### Badges (`@/components/ui/badge`)
Small solid status label with a `tone` (`success`, `warning`, `danger`, `neutral`), used for availability ("3 available" / "Fully booked") and payment states. The tone mapping in the Status pills table below applies.

### Buttons (`<Button>`)
| Variant | Look | Use |
|---|---|---|
| `primary` | Solid `--accent`, white text | The one main action on a screen: "Book now", "Pay GH₵ 200", "Allocate room" |
| `secondary` | Glass with `--line` border | Other actions: "View rooms", "Cancel" |
| `ghost` | Text only, glass on hover | Low-priority actions inside cards and lists |
| `danger` | Solid `--danger`, white text | Destructive actions: "Remove tenant", "Delete building" |

- Pill shaped, at least **44px tall** (touch target), label in sentence case starting with a verb.
- **At most one `primary` per screen.**
- While working, show `busy` (spinner + "Please wait…") and block double clicks. Don't disable buttons to hide errors; show the error instead.
- Payment buttons always include the amount: "Pay GH₵ 200".

### Cards (`<Card>`)
- Glass surface, 22px radius, 20px padding (16px on phones).
- A listing card is: photo (4:3) with an area chip in the top-left corner → title → room types → divider → price on the left, status pill on the right. The whole card is the link.
- Lists of many items (tickets, payments, tenants) use **rows inside one card** with dividers, not a card per item.

### Status pills (`<StatusPill status="…">`)
Small rounded label, tinted background with darker text of the same colour. **Every status in the app maps to exactly one tone**, so the same word always looks the same:

| Tone | Statuses |
|---|---|
| `ok` (green) | Paid, Available / N free, Resolved, Active, Approved |
| `warn` (amber) | Partial, Pending, Awaiting allocation, In progress, Booked, Due soon |
| `danger` (red) | Unpaid, Overdue, Fully booked, Rejected, Failed |
| `neutral` (blue tint) | Closed, Draft, Inactive, Info |

The mapping lives in `frontend/src/components/StatusPill.tsx`; add new statuses there, not in pages. Pills are never the only signal: the word is always written out.

### Form fields (`<Field>`)
- Label above the input, always visible (no placeholder-only labels). Placeholder shows a real example ("024 123 4567").
- Inputs on `--glass-strong`, 14px radius, 48px tall, 16px text (prevents zoom on iPhone).
- Errors appear under the field in `--danger`, saying what to do: "Enter a 10-digit MoMo number."
- Phone numbers: one field, Ghanaian format, `inputmode="tel"`. Money: `inputmode="numeric"`, GH₵ shown before the field.

### Navigation
- **Top bar (`<TopBar>`):** glass, sticky, logo left, sections in the middle (desktop), account + "Log out" right. Logged-out visitors see "Log in" and "Sign up". Nothing in it wraps; on phones the user's name is hidden to make room.
- **Phones:** the sections move to a scrollable pill row under the top bar. No hamburger menus for primary sections.
- Current section is a filled `--accent` pill; others are `--muted` text.
- Tenant, admin and staff areas share the same shell with different sections.

### Feedback
- **Banners (`<Banner>`):** a message above a form or list. `danger` for errors (announced to screen readers), `info` for neutral notes. One banner at a time; field problems go on the field, not in a banner.
- **Success:** short, past tense, no "successfully": "Payment received", "Room allocated".
- **Errors:** what happened and what to do, no "Error:" prefix: "MoMo prompt timed out. Try again."
- **Empty states:** say what will appear and how: "No reports yet. Use Report a problem to tell us about an issue."
- **Loading:** skeleton shapes in `--glass`, not spinners, for lists and cards.

## Motion
- Entrance: cards rise 8px and fade in over 600ms with `--ease`, staggered 60ms.
- Hover: cards lift 4px; buttons lift 2px and darken slightly. Hero menu links rise 2px while a thin underline slides in from the left (also on keyboard focus), and the logo tile tilts slightly (`navLinkClass` in `frontend/src/landing/parts.tsx`).
- Movement uses Tailwind's `motion-safe:` variant so it never runs for reduced-motion users.
- Respect **reduced motion**: when the device asks for it, there's no movement, only instant changes (handled globally in `components.css`).

## Accessibility (required)
- Text contrast at least **4.5:1** (3:1 for large text and icons), in light and dark mode.
- Every interactive element has a visible **focus ring** (`--focus`, 3px blue outline).
- Touch targets at least **44 × 44px**.
- Status is never shown by colour alone; icons have text labels or `aria-label`.
- Forms: every input has a `<label>`; errors are linked with `aria-describedby` and announced (`role="alert"`).
- Pages work at 200% zoom and at 360px wide without horizontal scrolling.

## Do and don't
| Do | Don't |
|---|---|
| One primary button per screen | Two blue buttons fighting for attention |
| Put text on glass or a scrim | Put text straight on a busy photo |
| Use `StatusPill` for every status | Colour status text by hand in a page |
| Use tokens (`var(--accent)`) | Hard-code hex colours |
| Show amounts as `GH₵ 1,200` | `1200`, `GHS1200.00`, `₵1,200` |
| Rows inside one card for long lists | A separate card per payment |
