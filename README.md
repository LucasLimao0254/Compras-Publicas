# Compras Públicas — MVP

Aplicação de gestão de compras públicas (licitações, contratos/atas, ordens de compra e
dashboard), construída seguindo o guia "Passo a Passo — Construção do Sistema de Compras
Públicas" (Fases 2 a 4). Este é o resultado da Fase 4, Sprints 1 a 7: um MVP funcional de
ponta a ponta (login → cadastrar contrato → emitir ordem → ver refletido no dashboard).

## O que já funciona

- Login com e-mail/senha, multi-tenant (município identificado por um "código"), JWT.
- Permissões por página (RBAC granular), como no sistema de referência analisado.
- CRUD de Usuários, Secretarias, Fornecedores, Licitações.
- Contratos com itens e cálculo de saldo **derivado** (nunca uma coluna solta que pode
  dessincronizar — ver seção 6.1 e 9.2 do documento de análise).
- Painel de Ordens com wizard de 2 passos (selecionar contrato → selecionar itens e
  quantidades), validação de saldo item a item, numeração sequencial por município e
  tudo dentro de uma transação (ou a ordem inteira é gravada, ou nada é).
- Dashboard com indicadores (saldo disponível, contratos ativos, ordens emitidas,
  situação dos contratos, top fornecedores).

## O que ainda não está aqui (ver roadmap V2/V3 no guia)

Aditivos contratuais, os outros 2 modos de controle de saldo, geração de minutas,
assinatura eletrônica, seleção de itens com IA, integração PNCP. Propositalmente fora do
MVP — ver Fase 7 do guia "Passo a Passo".

## Uma mudança em relação ao guia original: Prisma → Drizzle ORM

O guia recomendava Prisma. Durante a construção, o ambiente usado não tinha acesso à CDN
que a Prisma CLI usa para baixar o motor nativo (`binaries.prisma.sh`), o que bloqueou
`prisma generate`/`migrate`. Trocamos por **Drizzle ORM** (`drizzle-orm` + `pg`), que não
depende de nenhum binário nativo baixado à parte — só pacotes npm normais. Continua sendo
PostgreSQL, TypeScript, com migrations versionadas (`drizzle-kit`). Se seu ambiente tiver
acesso normal à internet, nada impede voltar para Prisma depois; a troca não muda nenhuma
decisão de modelo de dados do documento de análise.

## Estrutura

```
api/    Backend NestJS + Drizzle ORM + PostgreSQL
web/    Frontend React + Vite + TypeScript + Tailwind CSS
docker-compose.yml   Postgres via Docker (alternativa ao banco de dev embutido)
```

## Como rodar

### 1. Banco de dados

Duas opções — escolha uma:

**Opção A — sem Docker (mais rápido para testar agora):** o backend já traz um script que
sobe um PostgreSQL real embutido (sem precisar instalar nada no sistema):

```bash
cd api
npm install
node scripts/devdb.js start
```

Isso deixa um Postgres rodando em `127.0.0.1:55432` (usuário/senha `postgres`/`postgres`),
com os dados salvos em `.pgdata/` na raiz do projeto. Para parar: `node scripts/devdb.js stop`.

**Opção B — Docker:**

```bash
docker compose up -d
```

Também sobe em `127.0.0.1:55432` com as mesmas credenciais.

### 2. Backend

```bash
cd api
npm install          # se ainda não rodou
cp .env.example .env # já vem preenchido para a opção A/B acima
npx drizzle-kit push --config=drizzle.config.ts   # cria as tabelas
npx ts-node -r dotenv/config src/db/seed.ts       # cria dados de exemplo + usuário admin
npm run start:dev
```

A API sobe em `http://localhost:3001`.

Login de teste criado pelo seed: **código do município `1`**, e-mail
`admin@demo.gov.br`, senha `demo123`.

### 3. Frontend

```bash
cd web
npm install
npm run dev
```

Abre em `http://localhost:5173` (o Vite já está configurado para redirecionar chamadas
`/api/*` para o backend em `localhost:3001`, então não precisa mexer em CORS em dev).

## Variáveis de ambiente (`api/.env`)

```
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/postgres
JWT_SECRET=troque-isto-em-producao
PORT=3001
```

## Próximos passos técnicos sugeridos

1. Testes automatizados (Jest) cobrindo isolamento entre municípios e cálculo de saldo —
   ver Fase 5 do guia.
2. Trocar o JWT_SECRET e desabilitar o Postgres de desenvolvimento embutido antes de ir
   para produção (ele é só para rodar localmente sem instalar nada).
3. Seguir a Fase 6 do guia (backup automático, monitoramento, deploy) antes do piloto com
   um município real.
