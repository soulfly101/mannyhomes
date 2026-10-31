# Altheo Homes design rules

**Direction: Calm glass.** Ocean blue and white, frosted-glass cards over soft blue backgrounds and apartment photos, pill-shaped controls. It's the look of the first version of the app, cleaned up: less blur, stronger text contrast, and one set of components used everywhere.

Everything below is implemented in `frontend/src/styles/` (tokens and component CSS) and `frontend/src/components/` (React components). Use those; don't restyle things page by page. If a page needs something these rules don't cover, add it here and to the shared components first.

## Principles
1. **Calm.** Soft blues, lots of space, one strong action per screen. Nothing flashes or shouts.
2. **Readable first.** Glass is decoration; text always sits on a surface opaque enough to pass WCAG AA contrast.
3. **Money is unmistakable.** Amounts, due dates and payment states are the clearest things on any screen that shows them.
4. **Phone first.** Most tenants pay and report problems from a phone on mobile data. Design at 360px wide, then scale up.

## Colour
All colours are CSS variables in `frontend/src/styles/tokens.css`, with light and dark values. Never write a hex code in a component.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#E8F2FB` | `#051726` | Page background |
| `--fg` | `#0A2540` | `#E6F2FC` | Main text, headings |
| `--muted` | `#3F5B75` | `#A3BDD4` | Secondary text, labels |
| `--accent` | `#1677C9` | `#4FA9F0` | Primary buttons, links, focus, selected states |
| `--accent-ink` | `#FFFFFF` | `#04213A` | Text on `--accent` |
| `--glass` | white 72% | navy 55% | Card surface |
| `--glass-strong` | white 88% | navy 85% | Top bar, menus, dialogs, form fields |
| `--glass-edge` | white 95% | light blue 22% | Card border (the "glass edge") |
| `--line` | navy 10% | light blue 14% | Dividers, field borders |
| `--ok` / `--ok-bg` | `#0F7B5F` | `#5FD3AE` | Paid, free, resolved, success |
| `--warn` / `--warn-bg` | `#9A5B00` | `#F4C063` | Partial, pending, awaiting, booked |
| `--danger` / `--danger-bg` | `#B42F2F` | `#FF8A8A` | Unpaid, overdue, errors, destructive actions |
| `--info-bg` | blue 12% | blue 14% | Neutral highlights, "in progress" |

- Blue means "you can act on this". Don't use it for decoration or status.
- Green, amber and red are **only** for status (see Status pills), never for decoration.
- Dark mode follows the phone or computer setting automatically. Check every screen in both.

## Type
- **Headings:** Bricolage Grotesque (variable), weight 600. **Body and UI:** Figtree (variable), weights 400, 500 and 600. Both are bundled with the app (`@fontsource-variable/*`), not loaded from Google, so pages work without third-party requests.

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
- **Glass:** `background: var(--glass)`, `border: 1px solid var(--glass-edge)`, `backdrop-filter: blur(12px) saturate(140%)`, `box-shadow: var(--shadow)`. If the browser can't blur, the solid `--glass-strong` fallback is used automatically (see `components.css`).
- **Background:** the page is `--bg` with two or three large, soft, blurred blue shapes (`.ambient`). On public pages, apartment photos can sit behind glass panels with a dark scrim so white text stays readable.
- **Shadows:** one soft shadow (`--shadow`) for cards; nothing else casts shadows.

## Components
Use the shared components. Each has tests in `frontend/tests/components/`.

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
- **Top bar:** glass, sticky, logo left, sections in the middle (desktop), account + "Log out" right.
- **Phones:** the sections move to a scrollable pill row under the top bar. No hamburger menus for primary sections.
- Current section is a filled `--accent` pill; others are `--muted` text.
- Tenant, admin and staff areas share the same shell with different sections.

### Feedback
- **Success:** short, past tense, no "successfully": "Payment received", "Room allocated".
- **Errors:** what happened and what to do, no "Error:" prefix: "MoMo prompt timed out. Try again."
- **Empty states:** say what will appear and how: "No reports yet. Use Report a problem to tell us about an issue."
- **Loading:** skeleton shapes in `--glass`, not spinners, for lists and cards.

## Motion
- Entrance: cards rise 8px and fade in over 600ms with `--ease`, staggered 60ms.
- Hover: cards lift 4px; buttons darken slightly.
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
