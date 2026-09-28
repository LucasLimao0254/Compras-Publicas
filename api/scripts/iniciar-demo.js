// Inicialização do ambiente de teste HOSPEDADO (render.yaml): um serviço só,
// com API em /api, frontend e arquivos de exemplo no mesmo endereço.
//
// Na primeira subida (banco vazio) cria o schema e aplica o cenário de teste
// (seed.ts + seed-teste.ts). Nas seguintes só sobe a API, preservando o que os
// testadores fizeram. Para recomeçar do zero, defina RESETAR_DADOS=true no
// serviço e reinicie; depois volte para false.
//
// Espera o build já feito: dist/ da API (com dist/schema.sql, gerado por
// `drizzle-kit export`) e web/dist.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { gerarArquivos } = require('./arquivos-teste');

const API = path.join(__dirname, '..');
const WEB_DIST = path.join(API, '..', 'web', 'dist');
const ARQUIVOS = path.join(API, 'arquivos-teste');

async function prepararBanco() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida');
  const cliente = new Client({ connectionString: url });
  await cliente.connect();
  try {
    const resetar = process.env.RESETAR_DADOS === 'true';
    const { rows } = await cliente.query("select to_regclass('public.tenants') as t");
    const vazio = !rows[0].t;
    if (!vazio && !resetar) {
      console.log('Banco já preparado — mantendo os dados (RESETAR_DADOS=true recria do zero).');
      return;
    }
    if (resetar) {
      console.log('RESETAR_DADOS=true — apagando todos os dados do ambiente de teste.');
      await cliente.query('drop schema public cascade; create schema public;');
    }
    console.log('Criando o schema a partir de dist/schema.sql');
    await cliente.query(fs.readFileSync(path.join(API, 'dist', 'schema.sql'), 'utf8'));
  } finally {
    await cliente.end();
  }

  console.log('Aplicando os dados de cenário');
  for (const seed of ['seed.js', 'seed-teste.js']) {
    execFileSync(process.execPath, [path.join(API, 'dist', 'src', 'db', seed)], { stdio: 'inherit', env: process.env });
  }
}

async function main() {
  await prepararBanco();
  await gerarArquivos(ARQUIVOS);
  process.env.SERVIR_FRONTEND = WEB_DIST;
  process.env.ARQUIVOS_TESTE_DIR = ARQUIVOS;
  require(path.join(API, 'dist', 'src', 'main'));
}

main().catch((err) => {
  console.error('Falha ao iniciar o ambiente de teste:', err);
  process.exit(1);
});
