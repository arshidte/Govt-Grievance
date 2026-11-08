# UI Revamp — Design Language (single source of truth)

Reference: a clean, modern SaaS dashboard (white/neutral surfaces, subtle gray
borders, restrained blue accent, rounded cards, minimal shadows, strong
hierarchy). Adapt the *patterns* to the Panchayat Citizen Grievance Platform —
never copy the reference's project-management content or invent data.

All colors/spacing/radii below are existing `@pg/ui` tokens (Tailwind utilities
like `bg-primary-600`, `border-neutral-200`, `rounded-xl`). **Do not use
arbitrary values (`[...]`).** If a needed token is missing, add it to
`packages/ui/src/tokens.ts` (and the preset) rather than hardcoding.

## Color & surfaces
- **Canvas (page bg):** `bg-neutral-50`.
- **Surface (cards/panels):** `bg-white` + `border border-neutral-200` + `rounded-xl`. **Minimal shadows** — rely on borders + spacing. Use `shadow-sm` only for genuinely floating elements (dropdowns, dialogs, drawer).
- **Primary accent:** `primary-600` (solid actions / selected nav). Hover `primary-700`.
- **Borders/dividers:** `border-neutral-200`.
- **Text hierarchy:** headings `text-neutral-900 font-semibold`; body `text-neutral-700`; secondary/muted `text-neutral-500`; labels `text-neutral-600 text-sm`.

## Radius (consistent — pick from the scale, never mix ad-hoc)
- Cards/panels/inputs/buttons: `rounded-lg` (inputs/buttons) / `rounded-xl` (cards).
- Pills/badges/avatars: `rounded-full`.

## Buttons (keep `@pg/ui` Button API/variants/testids unchanged — restyle only)
- `primary`: `bg-primary-600 text-white hover:bg-primary-700`, `rounded-lg`.
- `secondary`: `bg-white border border-neutral-200 text-neutral-900 hover:bg-neutral-50`.
- `ghost`: transparent, `hover:bg-neutral-100`.
- `destructive`: `bg-status-escalated text-white`.
- Keep `min-h-11` (44px touch target), focus ring `ring-2 ring-primary-500 ring-offset-2`.

## Inputs & forms
- `bg-white border border-neutral-200 rounded-lg`, comfortable padding (`px-3 py-2.5`), `text-sm`.
- Focus: `focus:ring-2 focus:ring-primary-500 focus:border-primary-500`.
- Error: `border-status-escalated` + message below in `text-status-escalated text-sm` with `role="alert"` and `aria-describedby`/`aria-invalid` wired. Labels always associated (`htmlFor`).

## Badges / status (NEVER color alone — always icon + text)
- Soft tinted pill: light bg tint + stronger text of the same hue, `rounded-full`, `text-xs font-medium`, small leading icon. Keep `StatusBadge`/`PriorityBadge` APIs + testids.

## Navigation
- **Selected** nav item: `bg-primary-600 text-white` (solid, like the reference) OR `bg-primary-50 text-primary-700` for a lighter variant — pick ONE and use consistently per app. `aria-current="page"`.
- **Hover** (unselected): `hover:bg-neutral-100 text-neutral-700`.
- Nav items: `min-h-11`, icon + label, `rounded-lg`, `px-3`.

## Layout patterns
- **Admin & Citizen desktop:** persistent left **Sidebar** (brand at top, nav list, user/logout at bottom) + a compact top bar (page context / search / actions) + main content on `bg-neutral-50` with a max-width content column and consistent gutters (`p-6 lg:p-8`).
- **Page header:** title (`text-xl/2xl font-semibold`), optional subtitle/date/breadcrumb, right-aligned contextual actions (e.g. "Submit a Grievance").
- **Mobile:** sidebar becomes a drawer (admin already has `MobileDrawer`); citizen keeps its thumb-friendly **bottom nav**. No horizontal overflow; tables collapse to stacked cards; forms use full width; touch targets ≥ 44px.
- **Metric row (only REAL data):** a row of compact stat cards (label + number + small icon), e.g. citizen's own grievance counts by status, or admin's scoped counts. No invented analytics.

## States (design all four deliberately)
- **Loading:** skeletons / `LoadingState` (not spinners-only where content shape is known).
- **Empty:** `EmptyState` with a clear message + primary action (e.g. "Submit your first grievance" → `/report`).
- **Error:** `ErrorState` / `Alert variant="error"`, message mapped from `ApiClientError.messageKey` via i18n.
- **Success:** confirmation surfaces (e.g. the reference-number screen) — prominent, calm, reassuring.

## Accessibility & i18n (hard requirements — do not regress)
- All user-facing strings via `next-intl` `t(...)`; add new keys to BOTH `packages/i18n/messages/{en,ml}.json` (parity test-enforced). Verify Malayalam wrapping with the `font-malayalam` stack where needed.
- Semantic HTML, keyboard navigable, visible focus rings, labels tied to inputs, status never by color alone, sufficient contrast.
- Preserve every existing `data-testid` (unit + Playwright depend on them). Add new testids for new elements; never rename/remove existing ones.

## Iconography
- Consistent set. Prefer `lucide-react` (tree-shakeable, 1.5px stroke) added to `@pg/ui`, exposed through a thin wrapper if helpful — OR a shared inline-SVG icon module with uniform stroke. One approach, used everywhere.

## Hard constraints (from the task brief)
- UI only. **Do NOT** change business logic, API contracts, auth/session, RBAC, panchayat/ward scope, grievance lifecycle (`SUBMITTED → ACKNOWLEDGED → IN_PROGRESS → RESOLVED`), notification behavior, attachment rules, validation, routes (unless a UI-necessary tweak), data models, or migrations. No backend changes without reporting first. No mock/fake data in real screens. Don't remove working functionality.
