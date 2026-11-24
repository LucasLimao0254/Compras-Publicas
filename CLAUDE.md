# CLAUDE.md

> `MODELO.md`, na raiz do repositório, é a fonte de verdade do domínio — a cascata de
> abatimento Homologação → Ata → Contrato → Ordem, os dez invariantes que o sistema precisa
> manter e as decisões de escopo do MVP. Em qualquer divergência entre este arquivo e
> `MODELO.md`, `MODELO.md` vence; se algo aqui parecer contradizê-lo, é este arquivo que está
> desatualizado.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An MVP for public-sector procurement management (licitações, contratos/atas, ordens de
compra, dashboard) for Brazilian municipalities. It's a functional reimplementation of
selected features from a reference product ("Governo Digital" / Gavam), built from a
written functional analysis rather than from that product's source.

npm workspaces monorepo: `api` (NestJS backend) + `web` (React frontend). Root
`package.json` only has convenience scripts (`dev:api`, `dev:web`, `build:api`,
`build:web`); each workspace has its own `package.json` and is otherwise independent.

## Commands

### Database (required before running the API)

```bash
cd api
node scripts/devdb.js start   # starts a real embedded PostgreSQL on 127.0.0.1:55432 (no Docker/install needed)
node scripts/devdb.js stop    # stops it
```

`docker-compose.yml` at the repo root is an alternative (same port/credentials) for anyone
who prefers Docker over the embedded option.

### Backend (`api/`)

```bash
npm install
npx drizzle-kit push --config=drizzle.config.ts   # create/sync tables from src/db/schema.ts — no separate migration files, push-based
# push is interactive and unreliable for destructive changes (dropped/renamed columns, enum
# value renames) in this environment — it prompts for a choice per change and the prompt
# doesn't resolve non-interactively. For those, a one-off Node script with `pg.Client` running
# the equivalent ALTER TABLE/ALTER TYPE directly against DATABASE_URL, then deleted, has been
# the reliable path so far — additive changes (new table/column) push fine.
npx ts-node -r dotenv/config src/db/seed.ts       # idempotent: creates tenant "código 1", admin user, one sample contract
npm run start:dev      # nest start --watch, http://localhost:3001
npm run build          # nest build -> dist/src/main.js (NOT dist/main.js — package.json's "start" script accounts for this)
```

```bash
npm test                    # full suite (Jest) — needs the embedded Postgres running (see above)
npm run test:invariantes    # only api/test/invariantes/ — one spec per invariant in MODELO.md §2
```

`api/test/` is a self-contained integration harness against a real, disposable Postgres
database (`compras_test`, dropped and recreated on every run from `src/db/schema.ts` via
`npx drizzle-kit export`, since `drizzle-kit push` is unreliable for destructive schema
changes in this environment — see the one-off `pg.Client` migration pattern below). It never
touches the dev database. `tsc --noEmit -p tsconfig.json` is the fastest way to type-check
without a full Nest build.

### Frontend (`web/`)

```bash
npm install
npm run dev     # Vite dev server, http://localhost:5173, proxies /api/* to localhost:3001 (see vite.config.ts) — no CORS setup needed in dev
npm run build   # tsc -b && vite build
```

### Windows gotcha

If `npm install` fails silently or with obscure errors on Windows, the project is almost
certainly sitting under a very long path (e.g. deep inside `AppData\...`). Node's nested
`node_modules` trees routinely exceed `MAX_PATH`. Move the whole folder somewhere short
(`C:\dev\compras-publicas-mvp`) before debugging further.

## Architecture

### Why Drizzle, not Prisma

The schema and business logic were originally designed for Prisma; it was swapped for
**Drizzle ORM + node-postgres (`pg`)** because Prisma's CLI downloads a native engine
binary from `binaries.prisma.sh` at generate/migrate time, which is blocked in some
sandboxed/restricted-network environments. Drizzle needs no native binary — pure npm
packages — which made it possible to actually run migrations and integration-test this
project end-to-end during development. There is no other reason for the choice; reverting
to Prisma is a valid option if that constraint doesn't apply to you.

### Multi-tenancy

Single Postgres database, shared schema, `tenant_id` column on every business table
(`src/db/schema.ts`). There is **no query-builder-level enforcement** of tenant isolation
— every service method takes `tenantId` explicitly (usually as the first argument, read
from the JWT via `@CurrentUser()`) and every Drizzle `where` clause must include it. When
adding a new query, check the existing service methods in `src/contratos/contratos.service.ts`
or `src/ordens/ordens.service.ts` for the pattern before writing a new one — a missing
`tenantId` filter is a cross-tenant data leak, not just a bug.

### Auth & permissions (`src/auth/`, `src/common/`)

JWT payload carries `{ sub: usuarioId, tenantId, tipoUsuario, permissoes: string[] }` —
permissions are baked into the token at login time, not re-checked against the DB per
request. `JwtAuthGuard` validates the token; `PermissionsGuard` (paired with the
`@RequirePermission('compras.contratos')` decorator on controllers) checks the resource
string against `permissoes`, with `tipoUsuario === 'ADMIN'` always bypassing. Permission
strings mirror the frontend nav structure 1:1 (`administrativo.usuarios`,
`compras.dashboard`, `compras.ordens`, `compras.contratos`, `compras.licitacoes`,
`compras.fornecedores`, `compras.configuracoes`) — adding a nav item means adding the
matching permission string in both `api` and `web`, nothing more.

A route may list more than one resource — `@RequirePermission('compras.contratos',
'compras.ordens')` — and then any one of them is enough. This is used on the read endpoints
that feed selects on other screens (the secretarias list on the contract form, the contract
list in the order wizard, etc.); a handler-level decorator overrides the controller-level one.

### Vigência and signature dates are pure dates

`vigenciaInicial`/`vigenciaFinal`/`dataAssinatura` arrive as `YYYY-MM-DD` and are stored as
midnight UTC. Never compare them with `new Date()` nor format them in the local timezone —
midnight UTC is 21:00 of the previous day in Brasília, which made contracts expire a day early
and screens show the previous day. Use `src/common/datas.ts` on the API (`vigenciaEncerrada`,
`diasAte`, `formatarDataPura`) and `web/src/lib/datas.ts` on the frontend (`fmtDataPura`).
Real instants (`createdAt`, `criadoEm`, `enviadoEm`) keep using normal local formatting.

A contract's `vigenciaFinal` only changes through a PRAZO aditivo (and an ata's only through
`POST /atas/:id/prorrogar`) — neither update DTO accepts it, so every extension leaves a
record. Final before initial is rejected on create/update (`validarPeriodo`).

### CNPJ/CPF

`src/common/documentos.ts` validates check digits and returns the document masked
(`normalizarDocumento`); fornecedores and unidades executoras store that canonical form, and
duplicate checks compare digits only (`regexp_replace(..., '[^0-9]', '', 'g')`) so rows saved
before the normalization still match. Inside a Drizzle `sql` template literal write `[^0-9]`,
not `\D` — the template literal drops the backslash.

### Database errors

`PostgresExceptionFilter` maps unique violations (23505) and foreign-key violations (23503) to
409 and malformed ids/enum values (22P02) to 400. Drizzle wraps the driver error, so the
SQLSTATE lives in `.cause.code`, not on the thrown error itself.

### Saldo (contract balance) is always derived, never stored

`ContratosService` and `OrdensService` compute a contract's/item's remaining balance on
every read: `valorTotal (from itensContrato) - sum(itensOrdem.precoTotal for non-cancelled
ordens)`. There is intentionally no `saldo` column anywhere. If you're tempted to cache
or denormalize this for performance, first check `ContratosService.itensComSaldo` and
`.comSaldo` (used by the order-creation wizard to know what's still available) — those
call sites need the same on-demand computation to stay consistent with what an order is
about to consume.

### Order creation is a single transaction (`OrdensService.create`)

Validates saldo per line item, allocates the next sequential order number for the tenant
(`contadores` table, read-then-increment inside the same transaction), inserts the order
and its items — all inside one `db.transaction()`. Anything read inside that transaction
that needs to see the not-yet-committed rows must query via the `tx` handle, not the
outer `this.db` (a separate connection can't see uncommitted writes — this bit us once
during development; see the `findDetalhada(dbOrTx, ...)` helper pattern used to avoid it).

### Backend module layout

One Nest module per business entity (`usuarios`, `secretarias`, `fornecedores`,
`licitacoes`, `licitacoes-homologacao`, `contratos`, `aditivos`, `atas`, `dotacoes`,
`configuracoes`, `unidades-executoras`, `ordens`, `dashboard` — check `src/app.module.ts`
for the current, authoritative list), each with its own controller/service/dto, wired
together in `src/app.module.ts`. `DbModule` (`src/db/db.module.ts`) is `@Global()` and
exports a single `DRIZZLE` token — every service injects it rather than instantiating its
own pool.

### Homologação de licitação → extração determinística de planilha (`src/licitacoes-homologacao/`)

Upload de uma planilha `.xlsx` de homologação (empresas vencedoras + itens distribuídos +
valores) numa licitação, extraída e depois importada para os itens de uma Ata/Contrato. Ver
`briefing_upload_homologacao.md` para o desenho original (via PDF+IA) e a conversa que levou
à troca para planilha; pontos que não são óbvios lendo o código:

- **Por que planilha, não PDF+IA**: a primeira versão extraía texto de PDF com `pdf-parse` e
  mandava pra uma IA estruturar. Comparado com amostras reais do formato de homologação
  tabular usado pelo sistema de pregão do município, a extração de texto de PDF embaralhava
  a ordem das colunas de forma inconsistente entre blocos do mesmo documento — um parser
  determinístico em cima daquele texto arriscava associar o preço errado ao item errado, sem
  aviso. A planilha `.xlsx` exportada pelo mesmo sistema tem a mesma informação, mas em
  linhas/colunas de verdade — sem essa ambiguidade.
- **Formato esperado da planilha** (`ExtracaoHomologacaoService.extrair`): dentro de uma
  única aba, cada fornecedor vencedor começa com uma linha só na coluna A no formato
  `"Fornecedor: NOME- CNPJ"`, seguida de uma linha de cabeçalho de colunas, seguida das
  linhas de item daquele fornecedor (colunas `ITEM, QUANTIDADE, UNIDADE, DESCRIÇÃO, MARCA,
  MODELO, UNITÁRIO ADJUDICADO, TOTAL ADJUDICADO, UNITÁRIO ORÇADO, TOTAL ORÇADO, ECONOMIA %,
  ECONOMIA R$`) até a próxima linha `"Fornecedor:"` ou o fim da planilha. Só `UNITÁRIO
  ADJUDICADO` é importado como `valorUnitario` (é o preço realmente homologado); as colunas
  de orçado/economia são ignoradas — na amostra real usada para desenhar isso, a coluna
  ECONOMIA vinha com valores visivelmente errados no próprio sistema de origem.
- **Tabelas de rascunho** (`licitacaoHomologacoes`, `homologacaoFornecedores`,
  `homologacaoItens`) nunca são lidas por saldo/ordens/relatórios — só depois de
  `concluir-revisao` (status `'revisado'`) é que ficam disponíveis para import via
  `GET /licitacoes/:id/homologacao-itens`, que devolve uma cópia (não uma referência) para
  `itensContrato`/`ataItens`. A revisão humana continua obrigatória mesmo com extração
  determinística — planilhas reais têm erro de digitação (valor unitário trocado, etc.).
- **Extração é síncrona** (mesma requisição do upload) — sem chamada externa, sem custo por
  documento. Qualquer falha (planilha ilegível, nenhum bloco `"Fornecedor:"` encontrado)
  grava `status: 'erro'` com `erroDetalhe`, sem nunca chegar a inserir fornecedor/item.
- Arquivos ficam em `api/uploads/homologacoes/` (path configurável via
  `HOMOLOGACAO_UPLOADS_DIR`, gitignored) com nome gerado (`randomUUID()`) — nunca o nome
  original do arquivo, que fica só na coluna `arquivoNome` para exibição.
- As queries de `LicitacoesHomologacaoService.detalhe()` usam `orderBy` explícito por `id`
  nos fornecedores/itens — sem isso, um `UPDATE` (ex.: salvar um campo na tela de revisão)
  pode fazer o Postgres devolver a linha em outra posição na próxima leitura, e a tela
  "pula" itens de lugar a cada edição.

### Minutas → geração de documento por marcador de texto (`src/minutas/`)

Upload de um modelo `.docx` por tenant e por tipo (`ARP`, `CONTRATO`, `ADITIVO`,
`APOSTILAMENTO` — `minutaModelos`, UNIQUE em `tenantId`+`tipo`; reenviar substitui, nunca
acumula versões), com marcadores de texto (`{{numero_contrato}}` etc.) no corpo, substituídos
na geração pelos dados reais da entidade. Ver MODELO.md, seção 8.

- **Sem modelo cadastrado para um tipo, o documento daquele tipo não é gerado** — sem
  fallback, sem modelo de sistema. `MinutasService.gerar()` rejeita explicitamente; o
  frontend desabilita o botão de gerar com a razão dita ao lado
  (`GerarMinutaButton`), nunca o esconde.
- Mesmo padrão de upload de `licitacoes-homologacao`: nome gerado por `randomUUID()` no disco
  (`MINUTAS_UPLOADS_DIR`, configurável e gitignored), nome original só em coluna. Diferença:
  o controller usa multer em memória (não `diskStorage`) porque o service precisa abrir o
  arquivo como zip (`JSZip.loadAsync`) *antes* de gravar, para rejeitar um `.docx` corrompido
  sem nunca chegar a escrever no disco — por isso `enviarModelo()` recebe `{ originalname,
  buffer }`, não um path.
- Substituição (`preencherMarcadores`) roda sobre o corpo, cabeçalhos e rodapés do `.docx`
  (`word/document.xml`, `header*.xml`, `footer*.xml` — o `.docx` é um zip), parágrafo a
  parágrafo: o Word costuma partir um marcador digitado de uma vez em vários trechos `<w:t>`
  (revisão ortográfica, formatação no meio), então o texto do parágrafo é tratado concatenado
  e o valor entra no trecho onde o marcador começa. O valor recebe escape de XML (`&`, `<`,
  `>`, aspas), porque vem de campos livres (razão social, objeto etc.).
- Upload restrito ao Administrador do tenant — checado dentro do `MinutasService`, não só no
  `@RequirePermission` do controller.
- `GET /minutas/:tipo/:entidadeId` (gerar) exige `compras.contratos` **ou** `compras.atas` — as
  duas telas de onde os quatro tipos são gerados; passar pelo guard também aplica a trava de
  setor habilitado. `GET /minutas/modelos` aceita, além dessas, `compras.configuracoes` (as
  telas de contrato e ata leem a lista para habilitar o botão). O isolamento por tenant é
  garantido dentro do service.

### Frontend

Plain React Router SPA, no state library — each page component fetches its own data via
`src/lib/api.ts` (a thin `fetch` wrapper that attaches the JWT and redirects to `/login`
on 401). `src/auth/AuthContext.tsx` holds the logged-in user/tenant and exposes
`temPermissao(recurso)`, which `src/components/Layout.tsx` uses to filter the sidebar —
the same permission strings as the backend, so a page hidden from nav is also rejected
server-side if hit directly.

### What's deliberately not implemented

The two alternate balance-control modes beyond `quantidade × valor unitário`, electronic
signatures, and PNCP integration are out of scope for this MVP by design — see the
project's own README for the phased roadmap this was built against. (Contract amendments —
`aditivos` —, document/minuta generation, and spreadsheet-based extraction of homologação
documents *are* implemented; see the sections above.)
