# Handoff: Compras Públicas — Sistema de Gestão de Compras Municipais

## Overview
A municipal public-procurement management system (Brazilian Lei 14.133/2021 context): contracts, price-registration records ("atas"), purchase orders ("ordens de compra"), biddings ("licitações"), suppliers, and departments ("secretarias"). Tracks contract balances (saldo) as orders are issued against them, with amendments (aditivos) and draft generation (minutas).

## About the Design Files
The files in this bundle are **design references built in HTML** — high-fidelity prototypes of the intended look, layout, and interaction behavior. They are not production code to copy directly. The task is to **recreate these screens in the target codebase's existing environment** (its framework, component library, routing, and data layer) using its established patterns — or, if no frontend exists yet, to choose the most appropriate stack and implement the designs there. Treat the HTML/CSS/inline-style values as the source of truth for visual spec; treat the embedded JS as a behavioral reference for interaction logic, not as code to port verbatim (it uses a template-runtime not present in a real app).

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, and copy in the reference are final. Recreate pixel-accurately using the target codebase's component library/design tokens where they map onto this design system (Nocturne, described below); where the target app has no equivalent, use the token values listed here directly.

## Design System — "Nocturne"
Dark, compact, low-chroma interface. Key tokens (CSS custom properties, all consumed via `var(--*)` in the source file — do not hard-code hex values, re-derive them from the linked stylesheet if the token names differ in the target app):
- `--color-bg` (near-black blue-grey ground), `--color-surface`, `--color-text` (#e9e9ed-ish), `--color-divider`
- `--color-accent` — single accent, a blurple (~#9184d9), with tonal ramp steps `--color-accent-100…900` (100–300 = light steps for text-on-tint/pressed, 500 = base, 700–900 = dark tint fills)
- `--color-accent-2-*` — present but functionally identical to the accent ramp (mono palette)
- `--color-neutral-100…900` — same OKLCH-ramp treatment for neutral surfaces/text
- `--color-section`, `--color-section-glow` — the one place saturation is used as a deliberate accent (login split-panel, dashboard hero band)
- `--font-heading`, `--font-body` — both Inter; headings never exceed weight 500
- `--radius-*` (8px baseline), `--shadow-sm/md/lg`
- Buttons are **outlined**, never solid-filled (`.btn-primary` = accent border on transparent)
- Left-aligned, asymmetric layouts; flush-left headings; whitespace to the right
- Icons: Phosphor (loaded via `@phosphoricons/web` CDN link in `<head>`)
- Interactive states: hover tints from the ramp, `:focus-visible` = 2px accent outline, never default browser focus/blue links

The full system (stylesheet, tokens, component reference pages) lives in the `_ds/nocturne-*` folder shipped alongside the HTML files in this project — copy that folder too if the developer wants to inspect the raw CSS variables and component markup patterns (buttons, cards, tables, dialogs, forms, nav).

## Screens / Views
Single-file app (`Compras Publicas - Nocturne.dc.html`) with a persistent left sidebar (238px, grouped nav: **Compras** group — Visão geral, Contratos, Atas de registro de preços, Painel de ordens, Licitações, Fornecedores; **Administrativo** group — Secretarias) plus a login screen (split-panel: form left, accent gradient hero right, demo credentials shown).

1. **Login** — split 1fr/1fr grid, form (matrícula/código, senha) left; accent gradient panel with a quote/tagline right.
2. **Visão geral (Dashboard)** — hero band (accent gradient) showing saldo disponível (large number, R$), a usage progress bar (utilized vs. available %, glowing accent fill), summary of contracts vigentes. Below: cards/lists for at-a-glance status.
3. **Contratos** — contract list; each contract has a sub-page (drill-in) showing its items, its orders (ordens) issued against it, aditivos (contractual amendments) tab, and a "Minutas" (draft generation) tab. Tabs pattern: `.tabbtn` row (Itens / Ordens / Aditivos (n) / Minutas).
4. **Atas de registro de preços** — price-registration record list, similar contract-style browsing.
5. **Painel de ordens** — orders dashboard with two view modes: grouped-by-contract vs. flat list (all orders in one sortable/filterable table, wrapped in a horizontal scroller for wide columns); sort and filter controls; a history modal per order; order numbering derived from contract sequence with letter suffixes (e.g. `018/2026 A`, `018/2026 B`, then sub-splits `A1`, `A2`).
6. **Licitações** — bidding records list.
7. **Fornecedores (Suppliers)** — supplier list with CNPJ, razão social, contract count, total value; filterable by supplier balance.
8. **Secretarias (Departments)** — department list under an "Administrativo" nav group.

### Layout conventions
- Sidebar: logo mark (Phosphor `ph-scales` icon + wordmark "Compras Públicas"), org card (município name + state/código), grouped nav items (`.nav-item`, active state = accent-tinted background + left accent bar), user footer (avatar initials, name/role, sign-out icon).
- Content area: `padding: 28px 40px 56px`, `max-width: 1240px`, eyebrow label (uppercase, accent, 11px) + `h2` page title (30px).
- Data tables use the Nocturne `.table` component styling; row density is togglable (compact vs. comfortable — see Tweaks below).

## Interactions & Behavior
- **Densidade (row density) toggle**: `compacta` vs `confortavel` — changes table row vertical padding via a `data-dens` attribute on the app root, driven by a tweak/prop (see Design Tokens/Props).
- **Saldo em barra toggle**: shows/hides the saldo (balance) usage as a progress bar on relevant views.
- **Contract sub-pages**: clicking into a contract navigates to a detail view with tabs (Itens, Ordens, Aditivos, Minutas); closing an order-emission wizard from within a contract sub-page returns to that same sub-page (state preserved, not reset to the contract list).
- **Painel de ordens toggle**: switch between "grouped by contract" and "flat list" table views; flat list is horizontally scrollable.
- **Order history modal**: opens a modal (Nocturne `.dialog` pattern) showing the change history of a given order.
- **Order numbering logic**: orders are numbered `{contract-sequence}/{year} {letter}` (e.g. `018/2026 A`); when an order is split/amended it gets a numeric sub-suffix (`A1`, `A2`).
- **Login**: form submit (`entrar` handler) navigates into the app shell; sign-out icon in sidebar footer returns to login.
- All primary actions use outlined accent buttons (`.btn.btn-primary`); no solid button fills anywhere in the system.

## State Management
Reference implementation keeps all app state in a single component instance:
- `telaLogin` / `telaApp` — which top-level screen is shown
- current route (`rota`) — drives sidebar active state and main content switch (dashboard / contratos / atas / ordens / licitacoes / fornecedores / secretarias)
- per-contract sub-page state: selected contract id, active tab (`itens` / `ordens` / `aditivos` / `minutas`)
- `densidade` and `mostrarSaldoEmBarra` — layout-affecting flags (currently exposed as component props/tweaks, defaults `"confortavel"` and `true`)
- Painel de ordens: view mode (grouped vs flat), sort field/direction, active filters
- Mock data (contracts, orders, suppliers, departments, amendments) is generated in-file as static JS arrays/objects — a real build replaces this with API calls.

## Design Tokens
Pull exact values from the linked `_ds/nocturne-*/styles.css` — do not re-guess hex/px values. Notable ones used directly in the file:
- Sidebar width: `238px`
- Content max-width: `1240px`, padding `28px 40px 56px`
- Border radius baseline: `8px`; cards use `14px` for larger surfaces
- Type: eyebrow labels `11px` uppercase `letter-spacing:0.1em`; page titles (`h2`) `30px`; large stat numbers `38px` in `--font-heading`
- Row density (`data-dens`): `confortavel` = `padding-top/bottom: 13px` on table cells; `compacta` = tighter (see stylesheet rule near top of file)

## Component Props / Tweaks (already wired)
The root component exposes two tweakable props (current defaults, set via direct user edits):
- `densidade`: enum `"compacta" | "confortavel"` — default **`"confortavel"`**
- `mostrarSaldoEmBarra`: boolean — default **`true`**

## Assets
- Phosphor Icons, loaded via CDN link (`@phosphoricons/web@2.1.1`) — no custom icon assets.
- No photography/imagery used; this is a data-dense internal tool.
- Nocturne design-system stylesheet and bundle (`_ds/nocturne-38b99a3a-2155-4dac-b41f-16007c8615e5/`) — copy this folder if the developer needs the raw token/component CSS.

## Files in this bundle
- `Compras Publicas - Nocturne.dc.html` — the current, fully-featured design (all 8 screens, contract sub-pages, order dashboard with dual view modes, filters/sorting, history modal, tweak props).
- `Compras Publicas - UI Atual.dc.html` — the original UI reference this project started from (kept for comparison; superseded by the Nocturne file).
- `support.js` — runtime helper file the `.dc.html` format depends on to render in a browser (not application code — the target app does not need this file; it's an artifact of the prototyping environment).
- `_ds_nocturne/` — the Nocturne design-system source (stylesheet + component reference pages) referenced by the design file.
- `descricao_claude_design.md` — a supplementary reference doc (light-palette spec / typography notes) provided by the user; not yet applied to the current dark Nocturne build. Flag to the developer/designer that this may represent a **separate, alternate visual direction** under consideration, not a spec to merge automatically.
