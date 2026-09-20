# Handoff: Revisão de itens da homologação

## Why this bundle exists
Every other screen in this app already went through a high-fidelity design pass (see
`.design-handoff/design_handoff_compras_publicas/`, the Nocturne mockup covering
Dashboard, Contratos, Atas, Painel de ordens, Licitações, Fornecedores, Secretarias). The
homologação-review screen documented here was built **before** that pass, purely to make
the upload → extraction → review → import pipeline functional, and was never revisited.
It reuses the Nocturne base primitives (`.dialog`, `.input`, `.table`, `.btn`, `.card` —
see `web/src/index.css`, already the single source of truth for tokens in this codebase)
but has no custom layout or interaction design of its own — it looks and behaves like a
raw CRUD form. This bundle is the functional spec a designer needs to give it a real
design pass, consistent with the rest of the app.

There is no `.dc.html` mockup in this bundle (unlike the original Nocturne handoff) —
this package was authored directly from the current codebase, not from an external
design tool. `briefing_design.md` alongside this file is meant to be pasted into a
design-artifact tool to produce one.

## Where this screen sits in the product
Component: [`web/src/components/RevisarHomologacaoModal.tsx`](../../web/src/components/RevisarHomologacaoModal.tsx).
Opened from [`web/src/pages/Licitacoes.tsx`](../../web/src/pages/Licitacoes.tsx) (list
page, row-expand panel "Documentos de homologação") by clicking a homologação whose
status is `pronto_para_revisao` or `revisado`.

Full pipeline (see `CLAUDE.md`, section "Homologação de licitação"):

1. **Upload** — user uploads a `.xlsx` export from the município's own pregão system,
   directly from the expanded row in `Licitacoes.tsx` (`POST /licitacoes/:id/homologacao`).
2. **Extração determinística (síncrona)** — `ExtracaoHomologacaoService` parses the
   spreadsheet server-side, no AI/external call. Produces `licitacaoHomologacoes` (parent
   document) + one `homologacaoFornecedores` row per vencedor + one `homologacaoItens` row
   per item. Ends in status `pronto_para_revisao`, or `erro` (with `erroDetalhe`) if no
   `"Fornecedor:"` block could be found — that document never reaches step 3.
3. **THIS SCREEN — human review** — the reviewer corrects/completes whatever the
   extraction left incomplete and links each extracted fornecedor to a real, registered
   fornecedor (existing or newly registered inline, without leaving the modal).
4. **Concluir revisão** (`POST .../concluir-revisao`) — only enabled once every fornecedor
   is linked and every item is complete. Flips status to `revisado`. **This is the
   point of no return**: from here on, every `homologacaoItens` row becomes a fixed
   ceiling (`teto`) per fornecedor/item, referenced by `ataItens.homologacaoItemId` /
   `itensContrato.homologacaoItemId` as the root of the cascading-deduction chain
   (Homologação → Ata → Contrato → Ordem). The backend refuses to edit an item that
   belongs to an already-`revisado` homologação.
5. **Consumption, later, elsewhere** — a *different* component,
   [`ImportarHomologacaoModal.tsx`](../../web/src/components/ImportarHomologacaoModal.tsx),
   reads the now-`revisado` data (`GET /licitacoes/:id/homologacao-itens?fornecedorId=`)
   to let a user pick which items to copy into an Ata or Contrato. It is read-only
   (checkbox selection only, no editing) and is **out of scope for this bundle** — it
   already has its own simple, adequate UI; only the review screen (step 3) needs a
   design pass.

## Data this screen must represent
```
Homologacao          { id, arquivoNome, status, erroDetalhe }
└─ FornecedorHomologado[]  { id, nomeExtraido, cnpjExtraido, fornecedorId, fornecedor: {razaoSocial, cnpjCpf} | null }
   └─ ItemHomologado[]     { id, numeroItem, descricao, unidade, quantidade, valorUnitario, confiancaExtracao }
```
`confiancaExtracao` is `'alta' | 'media' | 'baixa' | null`, set by the extraction service
per item — **it exists in the data model and is returned by the API but is currently
never rendered anywhere in this screen.** See "Design opportunities" below.

Any of `descricao`, `unidade`, `quantidade`, `valorUnitario`, `cnpjExtraido`,
`fornecedorId` can arrive `null`/empty from the extraction — that's expected, not an
error state; it's exactly what this screen exists to fix.

## API surface (`api/src/licitacoes-homologacao/`)
- `GET /licitacoes/homologacoes/:homologacaoId` — full nested payload above.
- `PATCH /licitacoes/homologacoes/:homologacaoId/fornecedores/:fId` — any subset of
  `{nomeExtraido, cnpjExtraido, fornecedorId, novoFornecedor:{cnpjCpf,razaoSocial}}`.
  Sending `novoFornecedor` registers a brand-new fornecedor and links it in one call.
- `PATCH /licitacoes/homologacoes/:homologacaoId/itens/:itemId` — any subset of
  `{numeroItem, descricao, unidade, quantidade, valorUnitario}`. Rejected once the parent
  homologação is `revisado` (teto already fixed).
- `POST /licitacoes/homologacoes/:homologacaoId/concluir-revisao` — no body; backend
  re-validates completeness server-side too (the frontend gate is a UX convenience, not
  the only enforcement).
- `GET /fornecedores` — powers the "fornecedor cadastrado" dropdown (all fornecedores of
  the tenant, not filtered by anything homologação-specific).

Every field PATCH is independent — there's no "save all" action; each committed value is
already durable the moment it's sent.

## Current behavior, field by field (what exists today)
- **Layout**: one modal, `max-width: 820px`, `max-height: 86vh` with the whole body
  (including the primary action) scrolling together — one `.card` per fornecedor,
  stacked vertically.
- **Per-fornecedor header** (3-column grid): nome extraído (text input) · CNPJ extraído
  (text input) · fornecedor cadastrado (`<select>` of existing fornecedores). Below it, a
  ghost button "cadastrar como novo fornecedor" that expands an inline sub-form (CNPJ +
  razão social + confirmar/cancelar), pre-filled from the extracted name/CNPJ.
- **Item table**: plain `.table`, one row per item, every cell is its own text/number
  input (`numeroItem`, `descricao`, `unidade`, `quantidade`, `valorUnitario`).
- **Commit pattern**: every input is uncontrolled (`defaultValue`), committed only
  `onBlur` and only if the value actually changed, firing one `PATCH` per field per
  fornecedor/item. No optimistic state, no per-field pending/saved indicator, no undo.
- **Incomplete-field affordance**: a field with a missing/null value gets a plain amber
  border (`--color-warn`) — no icon, no tooltip, no per-field message, no aggregate count.
- **Completion gate**: a single derived boolean `pronta` (every fornecedor linked **and**
  every item has description+unidade+quantidade+valorUnitario) enables/disables "Concluir
  revisão". The only guidance when it's `false` is one static caption below the button —
  not specific to what's actually still missing.
- **Errors**: any failed PATCH sets one shared error string shown at the bottom of the
  whole modal — not attached to the field/row that actually failed.
- **Empty states**: "Nenhum item extraído para este fornecedor" / "Nenhum fornecedor foi
  extraído deste documento" — centered muted text, no icon/illustration (consistent with
  empty states elsewhere in the app, not a gap unique to this screen).
- **Parent status** (`processando` / `pronto_para_revisao` / `revisado` / `erro`) is shown
  as a tag on the *outer* row in `Licitacoes.tsx`, before the modal is even opened — a
  document with status `erro` is not clickable at all. `erroDetalhe` (the actual reason
  the extraction failed) is captured by the backend and typed on the frontend interface
  but is **not rendered anywhere** — the user sees only a dead "Erro na extração" tag with
  no explanation and no retry action from that context.

## Design opportunities (open questions for the design pass)
These are gaps observed while documenting current behavior, not requirements — flag/
prioritize as the designer sees fit:

1. **Surface `confiancaExtracao` per item** (e.g. a small dot/badge, or only calling out
   `baixa`) so the reviewer's attention goes to what the extraction algorithm is least
   sure about, instead of eyeballing every cell with equal weight.
2. **Real progress affordance** ("3 de 5 fornecedores vinculados", "2 itens pendentes")
   instead of scattered amber borders plus one generic caption under the button.
3. **Sticky action bar** — on a homologação with many fornecedores/items, "Concluir
   revisão" currently scrolls out of view with the rest of the content.
4. **Per-field save feedback** (saving/saved/error) attached to the field that actually
   changed, replacing the single shared error line for the whole modal.
5. **Surface `erroDetalhe`** somewhere reachable when status is `erro` — today the
   specific reason (e.g. "nenhum bloco Fornecedor: encontrado") is silently discarded from
   the user's point of view.
6. **This step is irreversible** (teto fixo the moment "Concluir revisão" is pressed) —
   worth a deliberate design treatment that communicates the one-way nature of the action
   (e.g. a confirming summary step), rather than a plain primary button with no
   distinction from any other save action in the app.
7. This screen should receive the same Nocturne visual language already applied to the
   rest of the app (dark surface, Inter type, single accent, outlined buttons — see
   `web/src/index.css`) — it is not a new design system, just a design pass this specific
   screen never got.

## Files in this bundle
- `README.md` — this file.
- `briefing_design.md` — Portuguese design-brief text, formatted to paste directly into a
  design-artifact tool to produce a high-fidelity mockup of this screen.
