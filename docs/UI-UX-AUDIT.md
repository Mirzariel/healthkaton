# SEHATI — rendered UI/UX audit

Date: 11 October 2026 (Asia/Jakarta). Baseline: the existing, uncommitted redesign; not Git HEAD. Scope: frontend presentation and accessibility only. Domain contracts, role permissions, state machines, schemas and demonstration records are preserved.

## Method and evidence

Reviewed AGENTS.md, DESIGN-SYSTEM.md, KONTRAK-DOMAIN.md, SURVEI-AI.md, KASUS-FASKES.md, MODUL-PENDING-KARTU-BAYAR-IMPOR.md, DASBOR-MUTU-EVALUASI.md and the navigation registry. Read the installed Next 16.3.8 CSS, images and server/client component guides before implementation.

Playwright Chromium inspects the actual existing application at http://localhost:3002. Widths: **320, 375, 390, 430, 768, 1024, 1440**, with a 900px matrix height and 740px interaction height. Screenshots, DOM measurements, browser errors and failed requests are saved to:

`C:/Users/Mirzariel/.codex/visualizations/2026/10/11/01a12bad-cec4-75f0-b68f-e4acbb0feb26/sehati-ui-qa/`

`before/matrix.json` and `before/interactions.json` contain the baseline measurements. Paired screenshots use the same names in `before/` and `after/`. `scripts/ui-qa.cjs` and `scripts/ui-qa-interactions.cjs` reproduce the checks using an available Playwright installation. Browser requests block domain mutations; session switching changes only isolated browser cookies. No reset endpoint is called. Existing pages may run their existing overdue-clarification maintenance on GET; this audit does not alter that behavior.

## Confirmed findings, recorded before implementation

| ID | Severity | Route / component | Problem and concrete baseline evidence | Correction |
|---|---|---|---|---|
| A01 | P0 | Console mobile drawer / `Shell.MobileMenu` | At 320px, Enter opens the modal but focus remains outside it. After 35 Tabs the focused element is a dashboard link behind the overlay; Escape closes it without returning focus to the menu trigger. `before/interactions.json`: `drawer-open`, `drawer-tab`, `drawer-escape`. | Use a native modal dialog for initial focus, modal background isolation, Tab containment, Escape and focus restoration. Retain role-specific links and scrollable drawer. |
| A02 | P1 | `/m`, participant treatment cards, A++ | At 320px / 22px text, the date range is 234–238px wide inside a 202px column. It extends beyond its card and is clipped by the phone shell. Page overflow is still zero, so a document-only check misses this. `participant-large-320.png` and interaction inner-overflow measurements. | Permit dates to wrap and constrain flex children; inspect all three text sizes, not just document width. |
| A03 | P1 | `/faskes/mutu`, facility navigation | Direct navigation leaves the active “Laporan mutu” tab at x=619–727 while the viewport is 320px. The visible header gives no indication of the current module. | Bring the active tab into view within the horizontal nav on route change; retain all destinations. Remove the permanent trailing fade over active text. |
| A04 | P1 | `/`, landing navigation | At 320px, menu target is x=288.7, width=36, so its last 4.7px lie outside the screen. Logo, CTA and fixed gaps consume more than the available header width. | Compact gaps; move the redundant console CTA into the expanded mobile menu below 640px; give the menu a 44px target. |
| A05 | P1 | `/console/cases`, mobile proof queue | The narrow table allocates its two visible columns to a long finding title and a status badge. Most scanning context is compressed into small secondary text, while source and assignee columns disappear at breakpoints. Screenshot `console-cases-320.png`, existing table column visibility. | Use structured mobile list rows with full record context and explicit statuses. Preserve the desktop table, filters, pagination and links. |
| A06 | P1 | Shared table containers, quality/payment/AI/detail pages | Wide tables correctly scroll locally, but there is no visible scroll instruction and unlabelled TableCards do not provide a keyboard-focusable region. Quality has a 58rem minimum table at 320px. | Make every table region keyboard focusable; show a concise scroll cue only when the rendered table actually exceeds its container. Preserve all columns. |
| A07 | P1 | Shared `text-muted`, subtle surfaces | Token #6c726e on #efeee9 gives **4.23:1** contrast, below 4.5:1 for normal text. Table headers, secondary filters and inset metadata use this pair. Computed sRGB luminance calculation; muted-on-white already passes (4.92:1). | Slightly darken the shared muted token; verify the three supported light surfaces. |
| A08 | P1 | Shared `InfoDot` | Rendered information buttons are 15×15px. They expose essential procedural terminology but are hard to target on touch screens. Matrix `smallControls`; actual button geometry. | Keep a restrained 15px glyph inside a larger target, at least 24px on desktop and 32px on touch. |
| A09 | P1 | `/m`, font preference | A clean browser starts with the intended 19px default, then shifts to 17px during hydration: `Number(localStorage.getItem(...))` turns missing storage into 0. Screenshot default “A” selection plus source confirms the cause. | Apply stored preferences only when a stored value exists. Preserve A/A+/A++ and their sizes. |
| A10 | P2 | `/`, mobile hero | At 320px the 49.6px headline forms five large lines and the hero exceeds the first 900px viewport. The primary action appears only around y=590; the prototype context is at the very bottom. `landing-320.png`, `hero-desktop.png`. Desktop mission composition is already strong. | Use fluid phone typography and tighter phone spacing, retain photographic focus and generous desktop composition; shorten supporting copy without stronger product claims. |
| A11 | P2 | `/`, mobile product theater and page rhythm | The desktop UI showcase becomes many vertically stacked tiny cards on phones. The phone overlaps the bottom console panel by 40px; the full 320px landing is **12,468px** tall. The surrounding repeated explanations and large section gaps delay comprehension. | Present sources as compact structured rows on phones; reserve desktop chrome/timeline for wider displays; stop the phone covering text; reduce phone-only section spacing and repetitive annotations. |
| A12 | P2 | Landing `Photo` | All three images request eager loading, including distant below-fold ward and consultation imagery. Responsive CDN candidates and explicit visual containers already work. | Keep the hero eager/high priority; lazy-load supporting images. Retain original assets and their source/license information. |
| A13 | P1 | Landing product showcase / `Theater` | User follow-up screenshot shows a content-sized, unusually wide console and a squat phone. The phone covers the console action panel. These dimensions do not represent typical application viewports. | Use a 1120×700 (16:10) console canvas and a 375×812 phone viewport, scaled proportionally; align without covering content. Match the actual dark console sidebar and participant header/question/footer. Keep previews synthetic and non-interactive. |

## Visual identity critique

The current dark green, warm paper, restrained Geist typography, real case data and neutral status vocabulary already provide an identifiable SEHATI direction. The hero expresses a mission without adoption or outcomes claims. The strongest visual device is the relationship between the operational case and a participant question; preserve it. Avoid adding another collection of decorative cards.

The weak point is the phone composition: desktop hierarchy turns into long miniature stacks, oversized headings and repeated explanation. Operational screens need actionable information before methodology, visible navigation state and readable records. Photo/dark contrast belongs in marketing; the console should remain calm and exact.

Reference interpretation: [Linear](https://linear.app/) presents a real product workflow under a concise promise; [Stripe](https://stripe.com/) groups capabilities into clear product narratives. These are useful principles of product proof, hierarchy and selective depth, not layouts or claims to copy. SEHATI's distinction remains human review, facility right of reply and traceability. Existing Unsplash assets remain; its [license](https://unsplash.com/license) permits free commercial/noncommercial use. No new images, new product features, institutional endorsements or autonomous AI claims are introduced.

## Route coverage

Matrix derived from `src/lib/nav.ts` and every existing page file. Parameterized pages use existing synthetic records; the retired autopilot page is checked for its redirect.

- Public: `/`; participant: `/m` plus home, A++, report, history disclosure and help interactions.
- Console: `/console`, `/console/cases`, `/console/cases/KS-0001`, `/console/assistant`, `/console/quality`, `/console/cards`, `/console/cards/FAC-RSHB`, `/console/payments`, `/console/payments/C-0001`, `/console/pending`, `/console/pending/TD-0001`, `/console/precheck`, `/console/precheck/C-0001`, `/console/documents`, `/console/documents/DOK-0001`, `/console/import`, `/console/standards`, `/console/standards/STD-JANJI`, `/console/audit`.
- AI: `/console/ai`, `/console/ai/sessions`, `/console/ai/sessions/SS-0001`, `/console/ai/standards`, `/console/ai/summary`, `/console/ai/sandbox`, `/console/ai/config`, `/console/ai/evaluation`; `/console/autopilot` redirect.
- Facility: `/faskes`, `/faskes/klarifikasi`, `/faskes/klarifikasi/KL-0008`, `/faskes/temuan/F-0095`, `/faskes/bukti`, `/faskes/tindakan`, `/faskes/bantahan`, `/faskes/mutu`.

The initial matrix began before implementation; later AI/facility screenshots overlapped the first shared-component fixes. Critical before/after findings use the earlier untouched interaction captures and landing/console screenshots. The final matrix was captured after the relevant changes. The final landing follow-up is in `showcase/` and its measurements/screenshots were merged into `after/`.

The original facility fixture `F-0001` returned 404 because it is not exposed to this facility through its permitted workflow. This was a fixture-selection issue, not a broken page: `F-0095`, referenced by its existing clarification `KL-0008`, renders successfully. Authorization was not relaxed.

## Baseline validation

- `npm run typecheck`: passed before changes.
- `npm test`: Windows sandbox workers initially fail to read Vitest temporary modules. Outside the sandbox: **223 passed / 1 failed, 9 files**. Existing failure at `tests/pkbi-pending-cards-payments.test.ts:256` expects today's date to equal `SEED_NOW` (10 October); execution date is 11 October. Claims snapshot and unchanged-clock assertions in that same test pass. This UI task does not change the domain clock or weaken its test.
- No lint script is defined in package.json.
- Baseline build was not run before the audit; final production builds passed after implementation.

## Implementation and final verification

All A01–A13 corrections are implemented. Scope of this turn: shared CSS, information targets, console modal, facility active navigation, participant text preference/date wrapping, table wrapper, mobile proof-queue records, landing composition/image loading, and the dimension follow-up. Existing uncommitted work remains intact. No schema, API handler, domain rule, permission or clock change was made.

| Check | Result | Evidence / practical limit |
|---|---|---|
| Complete route/width matrix | **38 routes × 7 widths = 266 rendered checks**; all final pages 200; no document overflow, uncaught browser errors, failed requests or broken images | `after/matrix.json`. Includes the expected autopilot redirect. This is representative route coverage, not every possible record/filter combination. |
| Native console modal | Initial focus inside; focus remains inside after 35 Tabs; Escape closes and restores trigger focus | `after/interactions.json`, `console-drawer-320.png`. Native modal also isolates the background; desktop breakpoint closes the drawer. |
| Participant A++ | No overflowing dates/cards at 320px; report, expanded history and help remain within the phone shell | Paired `participant-large-320.png`, `participant-report-320.png`, `participant-history-320.png`, `participant-help-320.png`. |
| Facility current route | Active “Laporan mutu” moves from x=619–727 to x=196–304 within the 320px screen | `after/interactions.json`, `facility-quality-320.png`. |
| Landing menu | 44×44px target at x=256–300, entirely inside 320px; expanded menu includes console, facility and participant entry points | `after/interactions.json`, `landing-menu-320.png`. |
| Table navigation | Local horizontal scrolling works with ArrowRight after keyboard focus; all columns preserved | Actual production `/console/quality`, `flow/flow.json`. Hint appears only when content exceeds the available width. |
| Text contrast | Muted #616963 is **5.66:1 on white, 5.23:1 on paper, 4.87:1 on subtle** | sRGB luminance calculation on the actual shared tokens. This verifies the identified token pair, not every image-overlay pixel or browser-native option. |
| Touch information target | **32×32px** in a touch-enabled 390px browser | `flow/flow.json`. Shared coarse-pointer buttons/fields use 44px minimum height. |
| Reduced motion | CSS page animation duration becomes 0.00001s | `after/interactions.json`; existing participant sheets already use `useReducedMotion`. New preview scaling has no animation. |
| Showcase dimensions | Console **1120×700**, rendered aspect **1.600**; phone **375×812**, rendered aspect **0.461835** | `showcase/` seven-width checks; production capture measured 886×553.75 and 270×584.625. These are static, proportionally scaled excerpts, not fully interactive applications. |
| Landing rhythm | 320px document height reduced from **12,468 to 10,510px** (15.7%); no global overflow masking | Paired landing screenshots. Full product/prototype/principles information remains available. |
| Real survey and sheets | Isolated directed survey started, “Saya lupa / tidak yakin” completed; stop dialog fits 320/375/390/430/768px, contains Tab focus, Escape restores trigger | `flow/participant-stop-*.png`, `flow/participant-completed-390.png`; isolated database contains `SS-0063`, completed/directed. No survey was created in the main demo. Initial test assertions were corrected to await the existing exit animation and scope alerts to the app rather than Next's route announcer. |
| Loading and error feedback | Delayed history shows loading then real data; intercepted help request shows Indonesian network error; no help record saved | `flow/flow.json`, `participant-network-error-390.png`. Network failure is intentionally injected, not an application failure. |
| Role-specific forms | Reviewer and verifier case screens rendered using their real demo cookies | `flow/reviewer-case-390.png`, `flow/verifier-case-390.png`; no review, assignment or facility command submitted. |
| Main demo integrity | Original participant retains only `SS-0037`; isolated copy additionally has test session `SS-0063`; claim records are byte-for-byte equal when serialized in ID order | Read-only comparison of `data/sehati-v2.db` and `data/ui-qa-isolated.db`. No main-demo reset or test submission. |
| `npm run typecheck` | **PASS** | Baseline and after final TSX changes. |
| `npm test` | **223 passed / 1 pre-existing failure** | Same date assertion at `tests/pkbi-pending-cards-payments.test.ts:256` before and after UI changes. No new test failures. |
| `npm run build` | **PASS** | Production compilation, TypeScript and page generation passed after the showcase follow-up. Prebuild writes `seed/sehati-seed.db`, not the running demo database. |
| Whitespace validation | **PASS** | `git diff --check`. No lint script is provided. |

## Presentation exports

Production screenshots are generated from native HTML/CSS at 3× device scale; images are not AI-generated or enlarged from a low-resolution screenshot. Individual-device exports omit headings, annotations and page background. They retain the simulated product UI and a restrained device frame.

- `SEHATI-tablet-transparent.png`: **3588×2328**, RGBA, transparent corner pixel verified (alpha 0).
- `SEHATI-handphone-transparent.png`: **1323×2634**, RGBA, transparent corner pixel verified (alpha 0).
- `SEHATI-product-showcase-2x.png`: **2880×2454**, full product section without the Next development badge.

Files are in the evidence directory above. `scripts/ui-qa-export.cjs` and `scripts/ui-qa-devices.cjs` reproduce the exports from the production server. The temporary QA server was stopped after verification; development serving was restored at port 3002 without resetting its data.

## Remaining limits

The full test suite is not green because of the documented pre-existing date assertion. No live model call, real OCR, institutional integration, physical-device/screen-reader audit or real authentication deployment is claimed. Existing prototype and role boundaries remain. UI error/loading states and a representative survey flow were tested; exhaustive destructive commands were deliberately not run on user data. Nothing was committed, pushed or deployed.

## Follow-up: blank product previews before hydration

The user's follow-up screenshot exposed a regression in `PreviewViewport`: the server emitted both contents with `visibility:hidden`, and only a client effect/ResizeObserver revealed them. The initial visual audit exercised hydrated browsers and missed this failure mode. Reproduced with browser JavaScript disabled: the device frames remained visible while both inner surfaces were blank. Normal hydrated rendering worked in the controlled browser; the specific reason that client initialization did not finish in the user's browser was not established.

The preview is now a Server Component. An SVG `viewBox` scales its fixed HTML `foreignObject` proportionally, without hooks, measurement, visibility toggles or JavaScript initialization. The 1120×700 / 375×812 dimensions and surrounding layout are unchanged. The device export selector now uses `data-preview-content` so native HTML extraction remains compatible.

`scripts/ui-qa-preview.cjs` checks all seven widths with JavaScript enabled and disabled, asserting visible content, preserved aspect ratios, no document overflow and no page errors. **All 14 checks passed.** Evidence: `preview-before/preview.json`, `preview-after/preview.json`, plus paired desktop/mobile captures in those folders. At mobile widths the existing compact console summary replaces the desktop screen; the phone remains visible. Raw server HTML now contains two preview contents and zero hidden-preview styles.

Typecheck and production build passed after the change. The existing test suite again reports 223 passed / 1 unchanged date-assumption failure at `tests/pkbi-pending-cards-payments.test.ts:256`. `git diff --check` passed. No data reset, commit, push or deployment was performed.
