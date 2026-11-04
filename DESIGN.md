# Altheo Homes design rules

**Direction: warm and friendly, with real motion** (chosen by the owner, 4 Nov 2026). Warm off-white pages, white cards, one terracotta accent, a friendly sans-serif, soft rounded shapes and big photos that come in from the sides as you scroll and pop out on hover. **Still no gradient colouring, glow, blurred colour blobs or frosted glass.**

New screens are built with **Tailwind CSS** and **shadcn**-style components:
- Primitives live in `frontend/src/components/ui/` (shadcn installs there; see `frontend/components.json`), app components in `frontend/src/components/`.
- Import with the `@/` alias (`@/components/ui/badge`, `@/lib/utils`), and combine classes with `cn()`.
- Colours come from the theme variables in `frontend/src/styles/globals.css` (`bg-background`, `text-foreground`, `bg-primary`, `text-muted-foreground`, `border-border`, `text-destructive`, `text-success`, …). Never hard-code colours.
- Components taken from 21st.dev or shadcn are adapted before use: strip gradients, blur, glow and off-brand accents (e.g. violet), and never show made-up people or testimonials.

The shared `Button`, `Field`, `Card`, `Banner` and `StatusPill` components (`frontend/src/components/`, styled in `components.css`) are used by the admin forms and share the same theme.

## Principles
1. **Warm and approachable, still professional.** Solid colours, generous space, one strong action per screen.
2. **Readable first.** Text sits on solid surfaces or a solid dark overlay over photos, never a gradient. WCAG AA contrast in light and dark mode.
3. **Money is unmistakable.** Amounts, due dates and payment states are the clearest things on any screen that shows them.
4. **Phone first.** Most tenants pay and report problems from a phone on mobile data. Design at 360px wide, then scale up.

## Colour
All colours are CSS variables in `frontend/src/styles/tokens.css`, with light and dark values. Never write a hex code in a component.

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` / `--bg` | `#FBF7F1` (warm off-white) | `#1A1512` | Page background |
| `foreground` / `--fg` | `#2A211B` | `#F5EDE4` | Main text, headings |
| `muted-foreground` / `--text-muted` | `#6B5E53` | `#B8A99B` | Secondary text, labels |
| `primary` / `--action` | `#B84E28` (terracotta) | `#F0915F` | The one accent: buttons, selected chips, links, focus |
| `primary-foreground` | `#FFFFFF` | `#1A1512` | Text on primary |
| `card` / `--glass` | `#FFFFFF` | `#241D18` | Cards, form fields |
| `accent` | `#F6E4D9` | `#3A2C23` | Soft circle behind icons |
| `border` / `--line` | `#EADFD2` | `#3A2F27` | Borders, dividers |
| `overlay` | dark at 50% | dark at 55% | **Solid** layer over photos so white text is readable |
| `--ok` / `--ok-bg` | `#0F7B5F` | `#5FD3AE` | Paid, free, resolved, success |
| `--warn` / `--warn-bg` | `#9A5B00` | `#F4C063` | Partial, pending, awaiting, booked |
| `--danger` / `--danger-bg` | `#B42F2F` | `#FF8A8A` | Unpaid, overdue, errors, destructive actions |
| `--info-bg` | blue 12% | blue 14% | Neutral highlights, "in progress" |

- Terracotta means "you can act on this" (or marks a section label). To change the accent, change `--primary` in `globals.css` and `--action` in `tokens.css`; every pair must stay at 4.5:1.
- Green, amber and red are **only** for status (see Status pills), never for decoration.
- Dark mode follows the phone or computer setting automatically. Check every screen in both.

## Type
- **Font:** Figtree (variable) for everything, bundled with the app. Headings are bold with slightly tight letter spacing (`font-bold tracking-tight`). No serif.
- **Section labels:** short sentence-case label in the accent colour (`Eyebrow` in `frontend/src/landing/parts.tsx`).

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
- **Corner radius:** pills and buttons round (`rounded-full`); cards and photos `20px` (`rounded-xl`); banners `32px`; fields `14px`.
- **Surfaces:** solid `card` background, 1px `border`, soft shadow. No `backdrop-filter`, no translucent glass.
- **Background:** plain `background` colour. Photos and video (landing hero, sign-in/sign-up) sit under a **solid** dark overlay when text is on top, never a gradient scrim.
- **Shadows:** neutral and soft: `shadow-sm` at rest, `shadow-xl` when a photo pops out. Nothing glows or takes on colour.

## Components
Use the shared components. Each has tests in `frontend/tests/components/`.

### Sign in, sign up and onboarding (`@/components/ui/sign-in`, `@/components/ui/sign-up`)
Two columns: form on the left, apartment photo on the right (photo hidden on phones). Built from `AuthSplitLayout`, `AuthField` (labelled, hint and error linked for screen readers, optional show/hide password), `SubmitButton` (busy state), `GoogleButton` and `FormError`.

### Public site pages
**One job per page; don't pile everything onto the home page.** Every public page shares the same menu (`SiteNav` in `frontend/src/landing/SiteHeader.tsx`) and footer with the contact form (`SitePage`).
| Page | What's on it |
|---|---|
| `/` home (`frontend/src/landing/`) | Hero (video/photo + menu), the Altheo experience, a **preview of 3 residences** with "View all residences", facilities, location map, gallery, call to action, footer |
| `/residences` | Every listed room type as big photo cards (`ResidenceCard`), with price and availability up front, and location and room type chips (kept in the address, e.g. `?location=Aburi&room_type=2+bedroom`) |
| `/residences/:id` | One room type: large photo and key facts, with a card that stays in view holding rent and fees (logged in only), availability, **Book now** and **Enquire** (fills in the footer contact form) |
| `/book/:id` | Booking a room type (tenants only): summary and the Mobile Money form (number, network, "Pay GH₵ 300") |
| *(booking steps)* | `BookingSteps` shows Details → Pay → Confirmed on `/book/:id` and `/bookings/:id` |
| `/bookings/:id` | One booking: "Approve the prompt on your phone" while waiting, then confirmed or failed with what to do next |
| `/dashboard` | A tenant's home base: "Booking Confirmed - Awaiting Room Allocation", checking by itself until a room is allocated, then their "Tenant Dashboard" with building, location, room type, room and costs |
| `/agreements/:id` | Read and sign the tenancy agreement (draw or type), then pay or print it. The document (`AgreementDocument`) is always white paper, in dark mode too, and prints cleanly |
| `/bills/:id/pay` | Pay one bill by Mobile Money; locked with a reason if it can't be paid yet |
| `/bookings` | A tenant's bookings |

Menu links to home page sections use `/#section` so they work from any page. **All copy, photos, facilities, locations and contact details are in `frontend/src/landing/content.ts`**; buildings, prices and availability come live from the admin inventory.

### Admin area
Every admin page sits in `AdminLayout` (`frontend/src/admin/AdminLayout.tsx`): a sidebar with icons on wide screens, a bar with a row of sections on phones. Add new admin sections to its `SECTIONS` list. `/admin` is the dashboard: stat cards, money collected per month, bookings by stage, recent tenants and recent activity. The sidebar has a **dark/light toggle**; the admin area starts dark. `/admin/allocations` (queue) links to one page per booking, `/admin/allocations/:id`, which says what saving will do before it's saved. Anything blocking an allocation is shown instead of the form, with what to do about it.

### Badges (`@/components/ui/badge`)
Small solid status label with a `tone` (`success`, `warning`, `danger`, `neutral`), used for availability ("3 available" / "Fully booked") and payment states. The tone mapping in the Status pills table below applies.

### Buttons (`<Button>`)
| Variant | Look | Use |
|---|---|---|
| `primary` | Solid `--action`, white text | The one main action on a screen: "Book now", "Pay GH₵ 200", "Allocate room" |
| `secondary` | Solid card colour with `--line` border | Other actions: "View rooms", "Cancel" |
| `ghost` | Text only, soft fill on hover | Low-priority actions inside cards and lists |
| `danger` | Solid `--danger`, white text | Destructive actions: "Remove tenant", "Delete building" |

- Pill shaped, at least **44px tall** (touch target), label in sentence case starting with a verb.
- **At most one `primary` per screen.**
- While working, show `busy` (spinner + "Please wait…") and block double clicks. Don't disable buttons to hide errors; show the error instead.
- Payment buttons always include the amount: "Pay GH₵ 200".

### Cards (`<Card>`)
- Solid surface, 20px radius, 20px padding (16px on phones), soft shadow.
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
- Inputs on the card colour, 14px radius, 48px tall, 16px text (prevents zoom on iPhone).
- Errors appear under the field in `--danger`, saying what to do: "Enter a 10-digit MoMo number."
- Phone numbers: one field, Ghanaian format, `inputmode="tel"`. Money: `inputmode="numeric"`, GH₵ shown before the field.

### Navigation
- **Public pages:** `SiteNav` stays at the top while scrolling. **Admin pages:** the `AdminLayout` sidebar. **`<TopBar>`** is only left on the status page.
- Logged-out visitors see "Log in" and "Sign up". Nothing in it wraps; below 1024px the sections move into the menu button. The logged-in person shows as their **initials** in a small round badge (`<UserInitials>`), never their full name, which stays available on hover and to screen readers.
- **Phones:** the sections move to a scrollable pill row under the top bar. No hamburger menus for primary sections.
- Current section is a filled `--action` pill; others are `--text-muted` text.
- Tenant, admin and staff areas share the same shell with different sections.

### Feedback
- **Banners (`<Banner>`):** a message above a form or list. `danger` for errors (announced to screen readers), `info` for neutral notes. One banner at a time; field problems go on the field, not in a banner.
- **Success:** short, past tense, no "successfully": "Payment received", "Room allocated".
- **Errors:** what happened and what to do, no "Error:" prefix: "MoMo prompt timed out. Try again."
- **Empty states:** say what will appear and how: "No reports yet. Use Report a problem to tell us about an issue."
- **Loading:** a short "Loading…" line for now; skeleton shapes when lists grow.

## Motion
- **Scrolling:** wrap things in `<Reveal>` (`frontend/src/components/Reveal.tsx`). Photos come in **from the sides**, alternating (`from={sideFor(i)}`); text and cards rise (`from="up"`). Each animates once, with `delay` to stagger a row. Content is never left hidden. Page wrappers use `overflow-x-clip` so slide-ins can't cause sideways scroll. Don't use it on forms.
- **Photos on hover:** `photoPop` on the frame or card and `photoZoom` on the image (`frontend/src/landing/parts.tsx`): it grows, rises, gets a deeper shadow and zooms inside its frame.
- Entrance: cards rise 8px and fade in over 600ms with `--ease`, staggered 60ms.
- **Everything clickable moves** (links, buttons, tabs, admin `.btn`s, in every area of the app): it lifts 2px on hover and presses in (scale 0.97) when clicked. This is a site-wide default in `frontend/src/styles/globals.css`, so new buttons and links get it automatically. Disabled and busy buttons stay still. Use `transition` rather than `transition-colors` on clickable elements, so the movement glides instead of jumping.
- Hover: cards lift 4px; buttons lift 2px and darken slightly. Hero menu links rise 2px while a thin underline slides in from the left (also on keyboard focus), and the logo tile tilts slightly (`navLinkClass` in `frontend/src/landing/parts.tsx`).
- Location chips pop out on hover (grow 5%, rise 2px, soft shadow) and press in slightly when clicked (`chipClass` in the same file).
- Movement uses Tailwind's `motion-safe:` variant so it never runs for reduced-motion users.
- Respect **reduced motion**: when the device asks for it, there's no movement, only instant changes (handled globally in `components.css`).

## Charts
Colours are `--chart-1` to `--chart-4` in `globals.css`, checked with the colour validator against the card colour in both modes. Lines are 2px with 8px markers and a 10% solid wash under them, never a gradient. Every chart has a hover tooltip and text for each value (a table or a labelled list), so colour is never the only signal. Show people as initials, never stock photos.

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
| Put text on a card or a solid overlay | Put text straight on a busy photo |
| Use `StatusPill` for every status | Colour status text by hand in a page |
| Use tokens (`var(--accent)`) | Hard-code hex colours |
| Show amounts as `GH₵ 1,200` | `1200`, `GHS1200.00`, `₵1,200` |
| Rows inside one card for long lists | A separate card per payment |
