// Migrações incrementais e idempotentes para bancos que já existem (o banco do
// ambiente hospedado, o de desenvolvimento). Bancos novos saem prontos do
// schema.ts (drizzle-kit export/push); estas instruções só levam um banco
// antigo até o schema atual, e podem rodar quantas vezes for preciso.
//
//   DATABASE_URL=... node api/scripts/migrar.js
//
// Rodado automaticamente por iniciar-demo.js a cada subida. Ao mudar o
// schema.ts de forma que um banco existente precise de ajuste, acrescente o
// SQL equivalente aqui (sempre com IF EXISTS / IF NOT EXISTS).
const { Client } = require('pg');

const MIGRACOES = [
  // Vários modelos de minuta por tipo (nome + modalidades)
  'ALTER TABLE IF EXISTS minuta_modelos DROP CONSTRAINT IF EXISTS minuta_modelos_tenant_id_tipo_unique',
  "ALTER TABLE IF EXISTS minuta_modelos ADD COLUMN IF NOT EXISTS nome text NOT NULL DEFAULT ''",
  "ALTER TABLE IF EXISTS minuta_modelos ADD COLUMN IF NOT EXISTS modalidades jsonb NOT NULL DEFAULT '[]'::jsonb",
  // Status de homologação substituída por reenvio
  "DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'homologacao_status') THEN ALTER TYPE homologacao_status ADD VALUE IF NOT EXISTS 'substituido'; END IF; END $$",
];

async function migrar(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL não definida');
  const cliente = new Client({ connectionString: url });
  await cliente.connect();
  try {
    for (const sql of MIGRACOES) await cliente.query(sql);
  } finally {
    await cliente.end();
  }
}

module.exports = { migrar };

if (require.main === module) {
  migrar().then(() => console.log('Migrações aplicadas.')).catch((e) => { console.error(e); process.exit(1); });
}
