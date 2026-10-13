// Ambiente de teste interno — sobe banco, API e frontend com dados de cenário
// e para na tela de login. Roteiro de testes: TESTE_INTERNO.md, na raiz.
//
//   npm run teste:interno                 (na raiz; recria os dados do zero)
//   npm run teste:interno -- --manter     (reaproveita os dados da última vez)
//
// Tudo fica separado do ambiente de desenvolvimento: outro Postgres embarcado
// (porta 55433, pasta .pgdata-teste), outro banco (compras_teste_interno),
// API na 3101 e frontend na 5174 — dá para ter os dois rodando ao mesmo tempo.
// Ctrl+C derruba tudo.

const { spawn, execSync } = require('child_process');
const { randomBytes } = require('crypto');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const EmbeddedPostgres = require('embedded-postgres').default;
const { gerarArquivos } = require('./arquivos-teste');

const RAIZ = path.join(__dirname, '..', '..');
const API = path.join(RAIZ, 'api');
const WEB = path.join(RAIZ, 'web');
const PASTA_TESTE = path.join(RAIZ, '.ambiente-teste');
const ARQUIVOS = path.join(PASTA_TESTE, 'arquivos');

const PG_PORTA = Number(process.env.AMBIENTE_TESTE_PG_PORTA || 55433);
const API_PORTA = Number(process.env.AMBIENTE_TESTE_API_PORTA || 3101);
const WEB_PORTA = Number(process.env.AMBIENTE_TESTE_WEB_PORTA || 5174);
const BANCO = 'compras_teste_interno';
const ADMIN_URL = `postgresql://postgres:postgres@127.0.0.1:${PG_PORTA}/postgres`;
const DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${PG_PORTA}/${BANCO}`;

const manterDados = process.argv.includes('--manter');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const pg = new EmbeddedPostgres({
  databaseDir: process.env.AMBIENTE_TESTE_PGDATA || path.join(RAIZ, '.pgdata-teste'),
  user: 'postgres',
  password: 'postgres',
  port: PG_PORTA,
  persistent: true,
});

const filhos = [];
const passo = (msg) => console.log(`\n▸ ${msg}`);

function rodar(cmd, args, opts = {}) {
  execSync([cmd, ...args].join(' '), { stdio: 'inherit', ...opts, env: { ...process.env, ...(opts.env || {}) } });
}

async function esperarHttp(url, segundos) {
  for (let i = 0; i < segundos; i++) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {
      // ainda subindo
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${url} não respondeu em ${segundos}s`);
}

async function prepararBanco() {
  passo('Recriando o banco de teste a partir do schema.ts');
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${BANCO} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${BANCO}`);
  await admin.end();

  // Mesmo caminho do harness de testes (test/global-setup.ts): `drizzle-kit
  // export` gera o SQL do schema sem prompts interativos.
  const sql = execSync(`${npx} drizzle-kit export --config=drizzle.config.ts`, { cwd: API, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, shell: true });
  const banco = new Client({ connectionString: DATABASE_URL });
  await banco.connect();
  await banco.query(sql);
  await banco.end();

  passo('Aplicando os dados de cenário');
  const env = { DATABASE_URL };
  rodar(npx, ['ts-node', 'src/db/seed.ts'], { cwd: API, env });
  rodar(npx, ['ts-node', 'src/db/seed-teste.ts'], { cwd: API, env });
}

function iniciar(nome, cmd, args, cwd, env) {
  // detached (fora do Windows) cria um grupo de processos próprio: ao encerrar
  // matamos o grupo inteiro — matar só o `npx` deixava o Vite órfão.
  const filho = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, shell: process.platform === 'win32', detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  const prefixar = (buf) => buf.toString().split('\n').filter(Boolean).forEach((l) => console.log(`[${nome}] ${l}`));
  filho.stdout.on('data', prefixar);
  filho.stderr.on('data', prefixar);
  filho.on('exit', (code) => { if (code && !encerrando) console.log(`[${nome}] terminou com código ${code}`); });
  filhos.push(filho);
  return filho;
}

function matar(filho) {
  if (filho.exitCode !== null) return;
  try {
    if (process.platform === 'win32') execSync(`taskkill /pid ${filho.pid} /T /F`, { stdio: 'ignore' });
    else process.kill(-filho.pid, 'SIGTERM');
  } catch {
    // já tinha terminado
  }
}

let encerrando = false;
async function encerrar() {
  if (encerrando) return;
  encerrando = true;
  console.log('\nEncerrando o ambiente de teste...');
  for (const f of filhos) matar(f);
  await pg.stop().catch(() => undefined);
  process.exit(0);
}
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);

async function main() {
  passo(`Subindo o Postgres de teste (porta ${PG_PORTA})`);
  try {
    await pg.initialise();
  } catch {
    // já inicializado
  }
  await pg.start();

  if (manterDados) passo('Mantendo os dados da última execução (--manter)');
  else await prepararBanco();
  passo(`Gerando arquivos de exemplo em ${path.relative(RAIZ, ARQUIVOS)}`);
  await gerarArquivos(ARQUIVOS);

  passo('Compilando a API');
  rodar(npx, ['nest', 'build'], { cwd: API });

  const uploads = path.join(PASTA_TESTE, 'uploads');
  iniciar('api', 'node', ['dist/src/main'], API, {
    DATABASE_URL,
    PORT: String(API_PORTA),
    // segredo aleatório a cada subida: sessões antigas caem ao reiniciar
    JWT_SECRET: process.env.JWT_SECRET || randomBytes(32).toString('hex'),
    HOMOLOGACAO_UPLOADS_DIR: path.join(uploads, 'homologacoes'),
    MINUTAS_UPLOADS_DIR: path.join(uploads, 'minutas'),
  });
  iniciar('web', npx, ['vite', '--port', String(WEB_PORTA), '--strictPort'], WEB, { API_URL: `http://localhost:${API_PORTA}` });

  passo('Aguardando API e frontend');
  await esperarHttp(`http://localhost:${API_PORTA}/auth/login`, 60);
  await esperarHttp(`http://localhost:${WEB_PORTA}/login`, 60);

  console.log(`
════════════════════════════════════════════════════════════════════
  Ambiente de teste interno no ar

  Abra:  http://localhost:${WEB_PORTA}/login

  Município (código) 1 — Prefeitura Municipal Modelo — senha de todos: demo123
    admin@demo.gov.br      Administrador (também admin de plataforma)
    compras@demo.gov.br    Comprador: módulos de Compras, sem Configurações
    rh@demo.gov.br         Só "Usuários" — não pode criar/promover ADMIN
    consulta@demo.gov.br   Só a Visão geral
    inativo@demo.gov.br    Desativado — o login deve ser recusado
  Município 2 — Câmara Municipal Modelo: admin@camara-demo.gov.br

  Arquivos para upload: ${path.relative(RAIZ, ARQUIVOS)}
  Roteiro de testes:    TESTE_INTERNO.md
  Ctrl+C encerra tudo.
════════════════════════════════════════════════════════════════════`);
}

main().catch(async (err) => {
  console.error('\nFalha ao subir o ambiente de teste:', err.message || err);
  for (const f of filhos) matar(f);
  await pg.stop().catch(() => undefined);
  process.exit(1);
});
