# SEHATI Design System (v2)

One visual language for the landing page (`/`), staff console (`/console/**`), facility portal (`/faskes/**`) and participant app (`/m`). Source of truth: `src/app/globals.css` (tokens + component classes), `src/components/ui.tsx` (React primitives), `src/components/icons.tsx` (icons), `src/components/Shell.tsx` (app shell).

**Character:** calm, precise, trustworthy. Warm off-white canvas, charcoal ink, one green brand accent (from the logo), hairline borders, restrained layered shadow. Status colours are only for status. Marketing may use photographic overlays and light/dark contrast; operational screens stay quiet. No decorative glow, oversized icons, filler illustrations or bouncy motion.

## 1. Tokens (Tailwind colour names)

| Role | Class | Notes |
|---|---|---|
| Canvas | `bg-paper` (#f6f6f2) | Page background everywhere |
| Subtle surface | `bg-subtle` (#efeee9) | Table heads, insets, hover |
| Card | `bg-card` (#fff) | All cards/panels |
| Hairline | `border-line` (#e8e6e1) | Card borders, dividers (`divide-line`) |
| Control border | `border-line-strong` | Inputs, secondary buttons |
| Text | `text-ink` / `text-ink-soft` / `text-muted` (#616963) | Primary / body-secondary / captions; muted passes 4.5:1 on all light surfaces |
| Brand | `bg-brand`, `text-brand`, `text-brand-ink`, `bg-brand-soft`, `bg-brand-tint` | Primary actions, active states, focus, links. Use sparingly |
| Warm accent | `bg-accent` | Small "needs attention" dots only |
| Status | `ok`, `warn`, `danger`, `info` + `-soft` | Badges, notices, chart semantics |

Do **not** introduce new hex colours in pages. Do not use `bg-line` as a fill except progress-bar tracks.

## 2. Typography (Geist + Geist Mono only)

| Use | Classes |
|---|---|
| Marketing display (landing only) | `text-[2.75rem] md:text-[4rem] font-semibold tracking-[-0.035em] leading-[1.02]` |
| Page title (`PageHeader`) | `text-[1.5rem] md:text-[1.75rem] font-semibold tracking-tight` |
| Section title (`SectionTitle`) | `text-[15px] font-semibold tracking-tight` |
| Card title (`CardHeader`) | `text-[14px] font-semibold` |
| Body | `text-[14px]`–`text-[14.5px] leading-relaxed text-ink-soft` |
| Table cell | `text-[13.5px]`/`text-sm`; secondary line `text-[12px] text-muted` |
| Form label | `.field-label` (13px/500 ink) · hint `.field-hint` (12px muted) |
| Data label / KPI label | `text-[12.5px]–[13px] font-medium text-ink-soft` |
| KPI value | `text-[1.75rem] font-semibold tracking-tight tabular-nums` |
| Eyebrow | `.eyebrow text-muted` (13px, sentence case) — only when it adds real context (e.g. the module group in `PageHeader`). Never ALL CAPS labels. |
| IDs, codes, claim numbers | `font-mono text-[12px]` |

Numbers: always `tabular-nums`. Line length for prose: `max-w-2xl`/`max-w-3xl`. Max weight 600 (use `font-semibold`; avoid `font-bold`/`font-extrabold`).

## 3. Spacing, layout, radii

- 4px grid. Page sections separated by `mt-10` (use `<Section>`); inside a section `space-y-4`.
- Card padding: `px-5 py-4` (dense lists: `px-4 py-3`). Table cells: `px-4 py-3`, header `px-4 py-2.5`.
- KPI grids: `grid grid-cols-2 gap-3 lg:grid-cols-4` (two columns on phones, never one tall stack of KPI cards).
- Radii: controls 8px (`rounded-lg`), cards/tables 12px (`rounded-xl`), badges 6px (`rounded-md`). Avoid `rounded-2xl`+ except the phone frame / landing hero preview.
- Depth (layered, never heavy): canvas `bg-paper` is slightly darker than cards so cards lift. `Card`/`Stat`/`TableCard` carry `shadow-depth-1` automatically; `<Card elevated>` (`shadow-depth-2`) for the one primary panel per view; `shadow-depth-3` only for floating layers (menus, drawers, tooltips). Secondary/meta info sits on `.panel-inset` (subtle tinted, hairline ring), not on yet another white card. Side columns quieter than main columns.
- Console content max width `76rem`, facility portal `72rem`.

## 4. Components (use these, do not re-invent)

From `@/components/ui`:
- `PageHeader({title, purpose, eyebrow, crumbs, children=actions})` — exactly one per page.
- `Section`, `SectionTitle({title, hint, info, children=actions})`.
- `Card`, `CardHeader({title, hint, children})`.
- `Stat` (KPI tile, `href` makes the whole tile a link), `StatusPill({tone})`, `ProofBadge`, `AiModeBadge`, `SourceBadge`, `Pill`.
- `Notice({tone: neutral|info|warn|danger|ok, title})` and `SimNotice` for prototype/simulation disclaimers.
- `TableCard` (wrap every `<table>`; delegates to `TableFrame` for a keyboard-focusable region and an overflow-only scroll cue), `Toolbar` (filter bar), `LinkTabs` (link-based tabs: `{href,label,active,count}`), `DescList` (key/value), `EmptyState({title, icon})`, `Forbidden`, `Skeleton`, `PageSkeleton`, `Breadcrumb`.

CSS classes (globals.css):
- Buttons: `btn` + `btn-primary` (one per view), `btn-secondary`, `btn-ghost`, `btn-danger`, `btn-dark`; sizes `btn-sm`, `btn-lg`. Works on `<button>` and `<Link>`.
- Inputs: `field` on input/select/textarea; labels `field-label`; hints `field-hint`.
- `link` for inline text links; `card`; `eyebrow`; `kbd`; `skeleton`; `scroll-x`.
- Tables get base styling automatically (header background, hairline rows, hover). Use `<table className="w-full text-left text-[13.5px]">`, `th`/`td` with `px-4 py-3`. Right-align numeric columns.

Icons: `@/components/icons` (16px default, stroke 1.75). Use only where they aid scanning (nav, empty states, notices, primary buttons). Never larger than 20px in app UI.

Shared form helpers already restyled: `components/casework/CommandForm.tsx`, `UploadBox.tsx`, `components/pkbi/kit.tsx` (`btn`, `primary`, `input`, `Field`, `Msg`). Keep using them.

## 5. Status language

- Status colour mapping lives in `TONE_CLASS` (`src/lib/labels.ts`). Always pair colour with a text label.
- Calm healthcare tone: "signal" is muted grey, not red. Red (`danger`) only for genuinely overdue/blocked/error states.
- Never imply SEHATI is an official BPJS Kesehatan product or has live integrations. Keep every existing disclaimer (use `Notice`/`SimNotice`). AI only suggests; humans decide. Never reword labels from `labels.ts` in a way that changes meaning.

## 6. Motion

- Page enter: `template.tsx` applies `animate-page-in` (240ms). Don't add more page-level animation.
- Interactions: colour/border transitions 120–180ms. Hover lift is not used.
- Available: `animate-fade-in`, `animate-sheet-in`, `.skeleton`. framer-motion exists for the participant app and tooltips only.
- `prefers-reduced-motion` is respected globally.

## 7. Responsive

- Test at 320, 375, 390, 430, 768, 1024, 1440. No horizontal page scroll; wide tables scroll inside `TableCard`. Do not mask page overflow globally.
- Filter bars wrap; on phones fields are full width (`w-full sm:w-auto`).
- Main touch controls ≥ 44px; participant primary buttons ≥ 48px. `InfoDot` has a 24px desktop target / 32px coarse-pointer target around its 15px glyph.
- Use structured mobile records for the proof queue, retaining source, assignee, claim and update date. Dense analytical tables preserve columns through local scrolling. Do not squeeze or silently discard record context.
- Console mobile navigation uses a native modal dialog with focus containment and restoration. Facility navigation reveals the active route within its own scroll container.
- Landing previews use fixed logical viewports: console 1120×700 (16:10), phone 375×812, scaled proportionally by the SVG `viewBox` in `PreviewViewport`. HTML content inside `foreignObject` renders on the server; never hide it pending hydration or browser measurements. They are non-interactive excerpts, not embedded applications. The phone must not cover console content.

## 8. Accessibility

Semantic headings in order, labelled controls, visible focus (global brand ring), `aria-current` on active nav, `role="status"`/`role="alert"` on async feedback, contrast ≥ 4.5:1 for text (`text-muted` is the lightest allowed text colour on white).

## 9. Anti-template rules (from the frontend-design review)

- No ALL-CAPS tracked labels, no eyebrow above every heading.
- No `01 / 02 / 03` numbering unless the content really is a sequence (survey stages and workflow steps are sequences; audiences and principles are not).
- No identical-card grids used as filler; vary hierarchy (lists, rules, a single emphasised card).
- Avoid decorative `→` on buttons/links (directional pager arrows are fine). Avoid joining unrelated meta with `·` in new layouts; use spacing/columns instead (existing data rows may keep it where it separates fields of one record).
- Monospace only for real codes (IDs, claim numbers, hashes), never for decorative labels.
- Spend boldness in one place per surface: the landing hero's real-product preview; everything else stays quiet.

## 10. Verifying rendered output

The rendered audit and reproduction commands are documented in `docs/UI-UX-AUDIT.md`. `scripts/ui-qa*.cjs` use an available Playwright installation through `QA_PLAYWRIGHT_MODULE`, with optional `QA_BROWSER` and `QA_BASE_URL`. The route matrix and interaction audit do not submit domain mutations. Survey flow testing uses only a separate database copy at port 3003. Never reset the main demo for visual QA.

## 11. Copy density (user preference, 2026-10-11)

The user wants minimal on-screen text. Page purpose: one short sentence (≤ ~15 words). Section hints only when they add information. Long explanations/methodology go behind `<details>` ("Selengkapnya") or `InfoDot` tooltips. Required disclaimers stay, compressed to one line. Prefer labels, numbers and status over sentences. Imagery: a few calm royalty-free healthcare photos, landing page only.
