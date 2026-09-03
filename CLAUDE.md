# CLAUDE.md

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
npx ts-node -r dotenv/config src/db/seed.ts       # idempotent: creates tenant "código 1", admin user, one sample contract
npm run start:dev      # nest start --watch, http://localhost:3001
npm run build          # nest build -> dist/src/main.js (NOT dist/main.js — package.json's "start" script accounts for this)
```

No test suite exists yet (Fase 5 of the build guide this project follows). `tsc --noEmit -p tsconfig.json` is the fastest way to type-check without a full Nest build.

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
`licitacoes`, `contratos`, `dotacoes`, `ordens`, `dashboard`), each with its own
controller/service/dto, wired together in `src/app.module.ts`. `DbModule` (`src/db/db.module.ts`)
is `@Global()` and exports a single `DRIZZLE` token — every service injects it rather than
instantiating its own pool.

### Frontend

Plain React Router SPA, no state library — each page component fetches its own data via
`src/lib/api.ts` (a thin `fetch` wrapper that attaches the JWT and redirects to `/login`
on 401). `src/auth/AuthContext.tsx` holds the logged-in user/tenant and exposes
`temPermissao(recurso)`, which `src/components/Layout.tsx` uses to filter the sidebar —
the same permission strings as the backend, so a page hidden from nav is also rejected
server-side if hit directly.

### What's deliberately not implemented

Contract amendments (aditivos), the two alternate balance-control modes beyond
`quantidade × valor unitário`, document/minuta generation, electronic signatures, AI-assisted
item selection, and PNCP integration are out of scope for this MVP by design — see the
project's own README for the phased roadmap this was built against.
