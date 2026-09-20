import { execSync } from 'child_process';
import { join } from 'path';
import { Client } from 'pg';
import { TEST_ADMIN_URL, TEST_DB_NAME, TEST_DB_URL } from './config';

// Recria o banco de teste do zero a cada execução, a partir do schema.ts
// (`drizzle-kit export` gera o SQL sem precisar de conexão — o `push` está
// quebrado neste ambiente, ver CLAUDE.md). Assim o teste nunca fica defasado em
// relação ao schema, e mudanças de schema (ex.: remover uma coluna) aparecem
// nos testes sem nenhuma migração manual.
export default async function globalSetup() {
  const admin = new Client({ connectionString: TEST_ADMIN_URL });
  try {
    await admin.connect();
  } catch (err) {
    throw new Error(
      'Não foi possível conectar ao Postgres de teste. Suba o embarcado antes: `cd api && node scripts/devdb.js start`.\n' +
        `Detalhe: ${err instanceof Error ? err.message : err}`,
    );
  }
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  await admin.end();

  const sql = execSync('npx drizzle-kit export --config=drizzle.config.ts', {
    cwd: join(__dirname, '..'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024,
  });

  const teste = new Client({ connectionString: TEST_DB_URL });
  await teste.connect();
  await teste.query(sql);
  await teste.end();
}
