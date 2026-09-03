import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as bcrypt from 'bcryptjs';
import * as schema from './schema';

const RECURSOS_PADRAO = [
  'administrativo.usuarios',
  'administrativo.secretarias',
  'compras.dashboard',
  'compras.ordens',
  'compras.contratos',
  'compras.atas',
  'compras.licitacoes',
  'compras.fornecedores',
  'compras.configuracoes',
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  const [tenant] = await db
    .insert(schema.tenants)
    .values({ codigo: 1, nome: 'Prefeitura Municipal Modelo' })
    .onConflictDoNothing({ target: schema.tenants.codigo })
    .returning();

  const tenantId = (tenant ?? (await db.query.tenants.findFirst({ where: (t, { eq }) => eq(t.codigo, 1) })))!.id;

  const senhaHash = await bcrypt.hash('demo123', 10);
  const existingUser = await db.query.usuarios.findFirst({ where: (u, { eq, and }) => and(eq(u.tenantId, tenantId), eq(u.email, 'admin@demo.gov.br')) });

  let usuarioId: string;
  if (!existingUser) {
    const [user] = await db
      .insert(schema.usuarios)
      .values({
        tenantId,
        cpf: '00000000000',
        nome: 'Administrador Demo',
        email: 'admin@demo.gov.br',
        senhaHash,
        tipoUsuario: 'ADMIN',
        ativo: true,
      })
      .returning();
    usuarioId = user.id;
    await db.insert(schema.permissoes).values(RECURSOS_PADRAO.map((recurso) => ({ usuarioId, recurso, permitido: true })));
  } else {
    usuarioId = existingUser.id;
  }

  let secretaria = await db.query.secretarias.findFirst({ where: (s, { eq }) => eq(s.tenantId, tenantId) });
  if (!secretaria) {
    [secretaria] = await db.insert(schema.secretarias).values({ tenantId, titulo: 'Secretaria Municipal de Saúde' }).returning();
  }

  let fornecedor = await db.query.fornecedores.findFirst({ where: (f, { eq }) => eq(f.tenantId, tenantId) });
  if (!fornecedor) {
    [fornecedor] = await db
      .insert(schema.fornecedores)
      .values({ tenantId, cnpjCpf: '00000000000100', razaoSocial: 'Fornecedor Modelo LTDA' })
      .returning();
  }

  let licitacao = await db.query.licitacoes.findFirst({ where: (l, { eq }) => eq(l.tenantId, tenantId) });
  if (!licitacao) {
    [licitacao] = await db
      .insert(schema.licitacoes)
      .values({
        tenantId,
        numero: '001/2026',
        numeroProcesso: 'PA-001/2026',
        objeto: 'Registro de preços para aquisição de material de escritório',
        modalidade: 'PREGAO_ELETRONICO',
        srp: true,
      })
      .returning();
  }

  let contrato = await db.query.contratos.findFirst({ where: (c, { eq }) => eq(c.tenantId, tenantId) });
  if (!contrato) {
    [contrato] = await db
      .insert(schema.contratos)
      .values({
        tenantId,
        numero: '010/2026',
        numeroProcesso: 'PA-001/2026',
        objeto: 'Aquisição parcelada de material de escritório',
        licitacaoId: licitacao!.id,
        orgaoGerenciadorId: secretaria!.id,
        fornecedorId: fornecedor!.id,
        vigenciaInicial: new Date('2026-01-01'),
        vigenciaFinal: new Date('2026-12-31'),
        formaFaturamento: 'SOB_DEMANDA',
        formaControleSaldo: 'NORMAL',
        situacao: 'VIGENTE',
      })
      .returning();

    await db.insert(schema.itensContrato).values([
      { contratoId: contrato!.id, numero: 1, descricao: 'Papel A4, resma 500 folhas', unidade: 'Resma', quantidade: '500', valorUnitario: '22.50' },
      { contratoId: contrato!.id, numero: 2, descricao: 'Caneta esferográfica azul', unidade: 'Unidade', quantidade: '2000', valorUnitario: '1.10' },
      { contratoId: contrato!.id, numero: 3, descricao: 'Toner para impressora laser', unidade: 'Unidade', quantidade: '40', valorUnitario: '180.00' },
    ]);
  }

  console.log('Seed concluído.');
  console.log('Login de teste -> município (código): 1 | e-mail: admin@demo.gov.br | senha: demo123');
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
