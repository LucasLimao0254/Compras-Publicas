import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import * as schema from './schema';

// Idempotente (ver CLAUDE.md): se o tenant código 1 já existir, não faz nada
// — seguro rodar de novo num banco que já tem dados. Não é pensado para
// popular um ambiente de demonstração rico; é só a base mínima para logar e
// começar a usar o sistema (o resto — contratos, atas, licitações — é
// exatamente o que um teste interno deve criar pela própria interface).
const PERMISSOES_ADMIN = [
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

// Catálogo de plataforma (setores/módulos) — não é dado de tenant, mas
// precisa existir pra qualquer coisa aparecer no menu (SetoresService.
// modulosDoTenant só devolve módulos de setores habilitados). Isto vivia
// antes só num script de migração de uso único, descartado depois de rodar
// — o que deixava um banco novo (drizzle-kit push + seed, o fluxo que o
// CLAUDE.md documenta) sem nenhum módulo cadastrado. Roda sempre, mesmo
// quando os tenants já existem (idempotente via onConflictDoNothing), pra
// nunca mais depender de um script à parte.
async function semearCatalogoSetores(db: ReturnType<typeof drizzle<typeof schema>>) {
  await db
    .insert(schema.setores)
    .values([
      { chave: 'compras', nome: 'Setor de Compras', descricao: 'Licitações, contratos, atas e ordens de compra', disponivel: true },
      { chave: 'controle_interno', nome: 'Controle Interno', descricao: 'Auditoria, conformidade e acompanhamento de processos', disponivel: false },
      { chave: 'licitacoes_portal', nome: 'Setor de Licitações', descricao: 'Portal de licitações e editais', disponivel: false },
    ])
    .onConflictDoNothing({ target: schema.setores.chave });

  const [setorCompras] = await db.select().from(schema.setores).where(eq(schema.setores.chave, 'compras'));

  await db
    .insert(schema.modulos)
    .values(
      [
        { recurso: 'compras.dashboard', nome: 'Visão geral', icone: 'ph-chart-line-up' },
        { recurso: 'compras.licitacoes', nome: 'Licitações', icone: 'ph-gavel' },
        { recurso: 'compras.fornecedores', nome: 'Fornecedores', icone: 'ph-storefront' },
        { recurso: 'compras.atas', nome: 'Atas de registro de preços', icone: 'ph-notebook' },
        { recurso: 'compras.contratos', nome: 'Contratos', icone: 'ph-file-text' },
        { recurso: 'compras.ordens', nome: 'Painel de ordens', icone: 'ph-clipboard-text' },
        { recurso: 'compras.configuracoes', nome: 'Configurações', icone: 'ph-gear' },
      ].map((m) => ({ ...m, setorId: setorCompras.id })),
    )
    .onConflictDoNothing({ target: schema.modulos.recurso });

  return setorCompras;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  const setorCompras = await semearCatalogoSetores(db);

  const [tenantExistente] = await db.select().from(schema.tenants).where(eq(schema.tenants.codigo, 1));
  if (tenantExistente) {
    console.log('Seed já aplicado (tenant código 1 já existe) — catálogo de setores/módulos conferido.');
    await pool.end();
    return;
  }

  const [tenant] = await db.insert(schema.tenants).values({ codigo: 1, nome: 'Prefeitura Municipal Modelo', tipo: 'Prefeitura Municipal' }).returning();

  const senhaHash = await bcrypt.hash('demo123', 10);
  const [admin] = await db
    .insert(schema.usuarios)
    .values({
      tenantId: tenant.id,
      cpf: '00000000000',
      nome: 'Administrador Demo',
      email: 'admin@demo.gov.br',
      senhaHash,
      tipoUsuario: 'ADMIN',
      ativo: true,
      // Também admin de plataforma — dá pra testar as telas de Setores &
      // Módulos e a troca de tenant sem precisar de uma segunda conta.
      ehAdminPlataforma: true,
    })
    .returning();
  await db.insert(schema.permissoes).values(PERMISSOES_ADMIN.map((recurso) => ({ usuarioId: admin.id, recurso, permitido: true })));

  // Setor de Compras habilitado por padrão — sem isso o tenant recém-criado
  // não veria nenhum módulo no menu (ver SetoresService.modulosDoTenant).
  await db.insert(schema.tenantSetores).values({ tenantId: tenant.id, setorId: setorCompras.id, habilitado: true });

  // Segundo tenant de demonstração, mesmo CPF do admin acima — sem isso a
  // troca de tenant (mesma pessoa, tenants diferentes) não tem o que testar
  // numa base recém-semeada.
  const [tenant2] = await db.insert(schema.tenants).values({ codigo: 2, nome: 'Câmara Municipal Modelo', tipo: 'Câmara Municipal' }).returning();
  const [admin2] = await db
    .insert(schema.usuarios)
    .values({
      tenantId: tenant2.id,
      cpf: '00000000000',
      nome: 'Administrador Demo',
      email: 'admin@camara-demo.gov.br',
      senhaHash,
      tipoUsuario: 'ADMIN',
      ativo: true,
    })
    .returning();
  await db.insert(schema.permissoes).values(PERMISSOES_ADMIN.map((recurso) => ({ usuarioId: admin2.id, recurso, permitido: true })));
  await db.insert(schema.tenantSetores).values({ tenantId: tenant2.id, setorId: setorCompras.id, habilitado: true });

  const [secretaria] = await db
    .insert(schema.secretarias)
    .values({ tenantId: tenant.id, titulo: 'Secretaria Municipal de Administração' })
    .returning();

  const [fornecedor] = await db
    .insert(schema.fornecedores)
    .values({ tenantId: tenant.id, cnpjCpf: '00.000.000/0001-00', razaoSocial: 'Fornecedor Modelo LTDA' })
    .returning();

  const [licitacao] = await db
    .insert(schema.licitacoes)
    .values({
      tenantId: tenant.id,
      numero: '001/2026',
      numeroProcesso: 'PA-001/2026',
      objeto: 'Registro de preços para aquisição de material de escritório',
      modalidade: 'PREGAO_ELETRONICO',
      srp: true,
    })
    .returning();

  const [contrato] = await db
    .insert(schema.contratos)
    .values({
      tenantId: tenant.id,
      numero: '001/2026',
      numeroProcesso: 'PA-001/2026',
      objeto: 'Fornecimento de material de escritório',
      licitacaoId: licitacao.id,
      orgaoGerenciadorId: secretaria.id,
      fornecedorId: fornecedor.id,
      vigenciaInicial: new Date('2026-01-01'),
      vigenciaFinal: new Date('2026-12-31'),
      situacao: 'VIGENTE',
      valorOriginal: '5000.00',
    })
    .returning();

  await db.insert(schema.itensContrato).values([
    { contratoId: contrato.id, numero: 1, descricao: 'Papel A4 (resma)', unidade: 'RESMA', quantidade: '200', valorUnitario: '20.00' },
    { contratoId: contrato.id, numero: 2, descricao: 'Caneta esferográfica azul', unidade: 'UN', quantidade: '500', valorUnitario: '2.00' },
  ]);

  console.log(`Seed aplicado: tenant "${tenant.nome}" (código ${tenant.codigo}). Login: admin@demo.gov.br / demo123`);
  console.log(`Segundo tenant para testar troca: "${tenant2.nome}" (código ${tenant2.codigo}). Login: admin@camara-demo.gov.br / demo123`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
