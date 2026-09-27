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

// Arquivos de exemplo para os testes de upload (homologação, itens de ata,
// planilha de demanda e modelos de minuta). Gerados a cada subida para
// sempre baterem com o formato que o código atual espera.
async function gerarArquivos() {
  passo(`Gerando arquivos de exemplo em ${path.relative(RAIZ, ARQUIVOS)}`);
  const XLSX = require('xlsx');
  const JSZip = require('jszip');
  fs.mkdirSync(ARQUIVOS, { recursive: true });

  // Célula numérica com formato de milhar — o caso que antes era lido 1000x menor.
  const comMilhar = (ws, colunas) => {
    const faixa = XLSX.utils.decode_range(ws['!ref']);
    for (let r = faixa.s.r; r <= faixa.e.r; r++) {
      for (const c of colunas) {
        const cel = ws[XLSX.utils.encode_cell({ r, c })];
        if (cel && typeof cel.v === 'number') cel.z = '#,##0.00';
      }
    }
  };
  const salvar = (nome, linhas, colunasNumericas = []) => {
    const ws = XLSX.utils.aoa_to_sheet(linhas);
    comMilhar(ws, colunasNumericas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Planilha1');
    XLSX.writeFile(wb, path.join(ARQUIVOS, nome));
  };

  const cabecalho = ['ITEM', 'QUANTIDADE', 'UNIDADE', 'DESCRIÇÃO', 'MARCA', 'MODELO', 'UNITÁRIO ADJUDICADO', 'TOTAL ADJUDICADO'];
  salvar('homologacao_exemplo.xlsx', [
    ['Fornecedor: FORNECEDOR MODELO LTDA- 00.000.000/0001-00'],
    cabecalho,
    [1, 1500, 'RESMA', 'Papel A4 75 g (resma com 500 folhas)', 'Chamex', 'A4', 21.9, 32850],
    [2, 2000, 'UN', 'Caneta esferográfica azul', 'Bic', 'Cristal', 1.8765, 3753],
    [],
    ['Fornecedor: PAPELARIA CENTRAL LTDA- 44.555.666/0001-77'],
    cabecalho,
    [3, 300, 'CX', 'Grampo 26/6 (caixa com 5000)', 'Jocar', '26/6', 6.5, 1950],
  ], [1, 6, 7]);
  salvar('itens_ata_exemplo.xlsx', [
    ['Item', 'Descrição', 'Unidade', 'Quantidade', 'Preço unitário'],
    [1, 'Água mineral 20 L', 'GL', 1200, 11.5],
    [2, 'Copo descartável 200 ml (pacote)', 'PCT', 3000, 4.35],
  ], [3, 4]);
  salvar('demanda_exemplo.xlsx', [
    ['Número do item', 'Quantidade'],
    [1, 10],
    [2, 5],
  ]);

  const docx = async (nome, paragrafos) => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    // cada parágrafo é uma lista de trechos (<w:r>) — o primeiro modelo
    // quebra um marcador em dois trechos, como o Word faz na prática
    const corpo = paragrafos.map((trechos) => `<w:p>${trechos.map((t) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`).join('')}</w:p>`).join('');
    zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${corpo}</w:body></w:document>`);
    fs.writeFileSync(path.join(ARQUIVOS, nome), await zip.generateAsync({ type: 'nodebuffer' }));
  };
  await docx('modelo_CONTRATO.docx', [
    ['CONTRATO Nº {{numero_', 'contrato}}'],
    ['Processo {{numero_processo}} — Licitação {{licitacao_numero}}'],
    ['Contratada: {{fornecedor_razao_social}} (CNPJ {{fornecedor_cnpj}})'],
    ['Órgão: {{orgao_gerenciador}}'],
    ['Objeto: {{objeto_contrato}}'],
    ['Valor total: R$ {{valor_total}}'],
    ['Vigência: {{vigencia_inicial}} a {{vigencia_final}}'],
  ]);
  await docx('modelo_ARP.docx', [
    ['ATA DE REGISTRO DE PREÇOS {{numero_arp}}'],
    ['Detentor: {{fornecedor_razao_social}} (CNPJ {{fornecedor_cnpj}}) — Licitação {{licitacao_numero}}'],
    ['Vigência: {{vigencia_inicial}} a {{vigencia_final}}'],
  ]);
  await docx('modelo_ADITIVO.docx', [
    ['{{numero_aditivo}} ao contrato {{numero_contrato}}'],
    ['Tipo: {{tipo_aditivo}} — Percentual: {{percentual}} — Valor: R$ {{valor_acrescimo}} — Dias: {{dias_prorrogacao}}'],
    ['Fundamento: {{fundamento_legal}}. Justificativa: {{justificativa}}. Assinado em {{data_assinatura}}.'],
  ]);
  await docx('modelo_APOSTILAMENTO.docx', [
    ['Apostilamento ao contrato {{numero_contrato}} — {{tipo_apostilamento}}'],
    ['{{descricao}} (de R$ {{valor_anterior}} para R$ {{valor_novo}}) — {{data}}'],
  ]);
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
  await gerarArquivos();

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
