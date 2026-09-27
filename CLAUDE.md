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

### Saldo (contract balance) is always derived, never stored

`ContratosService` and `OrdensService` compute a contract's/item's remaining balance on
every read: `valorTotal (from itensContrato) - sum(itensOrdem.precoTotal for non-cancelled
ordens)`. There is intentionally no `saldo` column anywhere. If you're tempted to cache
or denormalize this for performance, first check `ContratosService.itensComSaldo` and
`.comSaldo` (used by the order-creation wizard to know what's still available) — those
call sites need the same on-demand computation to stay consistent with what an order is
about to consume. The money math lives in `calcularSaldosContratos` (batched; used by the
contract list, the dashboard and the `{{valor_total}}` minuta marker) — reuse it instead of
re-deriving a contract's value somewhere else.

**Money is always two decimals, in integer cents** (`src/common/dinheiro.ts`): round each
line (`quantidade × valorUnitario`) to cents *before* summing, exactly like the
`precoTotal` stored on each order line. Summing floats with 4-decimal unit prices left
fractions of a cent that never reached zero. "Is this contract exhausted?" is answered by
quantity per item (`ContratosService.itensComSaldoRestante`), not by the R$ balance —
per-order rounding can legitimately leave ±R$ 0,01.

**Calendar dates** (vigência, assinatura) arrive as `AAAA-MM-DD` and are stored as UTC
midnight: compare and format them by day with `src/common/datas.ts` (`vencida`,
`formatarDiaBR`; `web/src/lib/datas.ts` on the frontend). A contract is still valid on its
last day. `new Date(vigenciaFinal) < new Date()` and a plain `toLocaleDateString()` are
both one day off in Brasília time.

**Aditivos vs. teto**: quantity added by a `QUANTIDADE` aditivo is outside the
ata/homologação ceiling (MODELO.md invariant 6) — ceiling consumption uses
`quantidadeConsumidaDoTeto` (`saldo-ceiling.service.ts`), never a raw
`sum(itensContrato.quantidade)`. `SUPRESSAO` takes items + quantities and lowers
`itensContrato.quantidade` (never below what orders already consumed); only a "Valor
global" contract suppresses by percentage.

### Order creation is a single transaction (`OrdensService.create`)

Validates saldo per line item, allocates the next sequential order number for the tenant
(`contadores` table, atomic `UPDATE ... SET x = x + 1 RETURNING` — a read-then-write let
concurrent emissions take the same number), inserts the order
and its items — all inside one `db.transaction()`. Anything read inside that transaction
that needs to see the not-yet-committed rows must query via the `tx` handle, not the
outer `this.db` (a separate connection can't see uncommitted writes — this bit us once
during development; see the `findDetalhada(dbOrTx, ...)` helper pattern used to avoid it).

### Postgres errors come wrapped

drizzle-orm 0.45 wraps driver errors in `DrizzleQueryError`; the SQLSTATE is on
`err.cause.code`, not `err.code`. Use `codigoPostgres(err)`
(`src/common/postgres-exception.filter.ts`) — the global filter maps `23505` (unique) and
`23503` (foreign key) to 409 through it.

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
- **Uma homologação revisada por licitação.** Concluir a revisão de um reenvio marca a
  anterior como `'substituido'` — ou é recusado se a anterior já está em uso por ata ou
  contrato (o teto é fixo). Duas `'revisado'` ao mesmo tempo duplicariam o teto.
- **Números de planilha**: toda leitura de `.xlsx` usa `sheet_to_json(..., { raw: true })` +
  `paraNumeroPlanilha` (`src/common/numero-planilha.ts`; cópia em
  `web/src/lib/planilhaDemanda.ts`). Com `raw: false` o SheetJS devolve o texto no formato
  americano (`1,500`) e ele era lido como padrão BR (1,5).
- Ata vinculada a homologação e contrato com origem só aceitam itens com
  `homologacaoItemId`; descrição, unidade e valor unitário vêm da homologação, nunca do
  cliente (MODELO.md, invariante 2).

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
- Substituição (`substituirMarcadores`) em `word/document.xml` e nos cabeçalhos/rodapés,
  parágrafo a parágrafo sobre o texto contínuo dos `<w:t>` — o Word costuma quebrar um
  marcador em vários trechos (`{{numero_` + `contrato}}`), que uma regex sobre o XML bruto
  não enxerga. Valor com escape de XML (`&`, `<`, `>`, aspas), porque vem de campos livres.
- Upload restrito ao Administrador do tenant — checado dentro do `MinutasService`, não só no
  `@RequirePermission` do controller.
- `gerar()` não exige uma permissão própria no controller: é chamado a partir de telas já
  gated por permissões diferentes conforme o tipo (contrato/ata), e o dado exposto é o mesmo
  que a tela de origem já mostra; o isolamento que importa (tenant) é garantido dentro do
  service, não no controller.

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
