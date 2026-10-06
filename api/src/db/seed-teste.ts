import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import * as schema from './schema';
import { DrizzleDB } from './db.module';
import { AtasService } from '../atas/atas.service';
import { ConfiguracoesService } from '../configuracoes/configuracoes.service';
import { ContratosService } from '../contratos/contratos.service';
import { OrdensService } from '../ordens/ordens.service';
import { SaldoCeilingService } from '../saldo-ceiling/saldo-ceiling.service';
import { hoje } from '../common/datas';

// Cenário do AMBIENTE DE TESTE INTERNO (scripts/ambiente-teste.js) — roda
// depois do seed.ts base, num banco próprio e descartável, nunca no banco de
// desenvolvimento. Monta dados em vários estados para quem testa já chegar
// ao sistema com algo para exercitar, a partir da tela de login. O roteiro de
// testes que usa estes dados está em TESTE_INTERNO.md, na raiz.
//
// Tudo que tem regra de negócio (ata, contrato, ordem, aditivo) é criado
// pelos próprios services, não por INSERT direto: assim os dados obedecem às
// mesmas validações (teto, invariantes) que a interface aplica.

const SENHA = 'demo123';

const PERMISSOES_COMPRAS = ['compras.dashboard', 'compras.ordens', 'compras.contratos', 'compras.atas', 'compras.licitacoes', 'compras.fornecedores'];

// 'AAAA-MM-DD' a N dias de hoje (fuso do órgão) — contratos "vence hoje" e
// "venceu ontem" precisam ser relativos à data em que o ambiente sobe.
function diaRelativo(dias: number): string {
  const d = new Date(`${hoje()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

async function main() {
  if (!/teste/i.test(process.env.DATABASE_URL ?? '')) {
    throw new Error('seed-teste.ts só roda num banco cujo nome contém "teste" — é para o ambiente de teste interno (scripts/ambiente-teste.js), nunca para o banco de desenvolvimento');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema }) as unknown as DrizzleDB;
  const saldo = new SaldoCeilingService();
  const configuracoes = new ConfiguracoesService(db);
  const contratos = new ContratosService(db, saldo);
  const atas = new AtasService(db, saldo, contratos);
  const ordens = new OrdensService(db, configuracoes);

  const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.codigo, 1));
  if (!tenant) throw new Error('Rode o seed.ts base antes (tenant código 1 não encontrado)');
  const tenantId = tenant.id;
  const [admin] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.email, 'admin@demo.gov.br'));

  // ---------- usuários, um por perfil ----------
  const senhaHash = await bcrypt.hash(SENHA, 10);
  const criarUsuario = async (cpf: string, nome: string, email: string, permissoes: string[], extra: Partial<typeof schema.usuarios.$inferInsert> = {}) => {
    const [u] = await db.insert(schema.usuarios).values({ tenantId, cpf, nome, email, senhaHash, tipoUsuario: 'PADRAO', ativo: true, ...extra }).returning();
    if (permissoes.length) await db.insert(schema.permissoes).values(permissoes.map((recurso) => ({ usuarioId: u.id, recurso, permitido: true })));
    return u;
  };
  const comprador = await criarUsuario('11111111111', 'Carla Compradora', 'compras@demo.gov.br', PERMISSOES_COMPRAS);
  await criarUsuario('22222222222', 'Rui Recursos Humanos', 'rh@demo.gov.br', ['administrativo.usuarios']);
  await criarUsuario('33333333333', 'Vera Consulta', 'consulta@demo.gov.br', ['compras.dashboard']);
  await criarUsuario('44444444444', 'Ivo Inativo', 'inativo@demo.gov.br', PERMISSOES_COMPRAS, { ativo: false });

  // ---------- cadastros de apoio ----------
  const [administracao] = await db.select().from(schema.secretarias).where(eq(schema.secretarias.tenantId, tenantId));
  const [saude] = await db.insert(schema.secretarias).values({ tenantId, titulo: 'Secretaria Municipal de Saúde' }).returning();
  const [educacao] = await db.insert(schema.secretarias).values({ tenantId, titulo: 'Secretaria Municipal de Educação' }).returning();

  const [limpaTudo] = await db.insert(schema.fornecedores).values({ tenantId, cnpjCpf: '12.345.678/0001-90', razaoSocial: 'Limpa Tudo Comércio LTDA' }).returning();
  const [protege] = await db.insert(schema.fornecedores).values({ tenantId, cnpjCpf: '98.765.432/0001-10', razaoSocial: 'Protege EPI Distribuidora LTDA' }).returning();

  const dotacoes = await db.insert(schema.dotacoes).values([
    { tenantId, gestaoUnidade: '02.01 — Administração', fonteRecursos: '1500 — Recursos livres', programaTrabalho: '04.122.0001.2001', elementoDespesa: '3.3.90.30' },
    { tenantId, gestaoUnidade: '05.01 — Saúde', fonteRecursos: '1600 — SUS', programaTrabalho: '10.301.0005.2030', elementoDespesa: '3.3.90.30' },
  ]).returning();
  const dotacaoSaude = dotacoes[1];

  await db.insert(schema.unidadesExecutoras).values({
    tenantId, cnpj: '11.222.333/0001-44', razaoSocial: 'Fundo Municipal de Saúde', endereco: 'Rua das Flores, 100 — Centro', cep: '00000-000',
    email: 'fms@demo.gov.br', ordenadorNome: 'Maria Ordenadora', ordenadorCargo: 'Secretária de Saúde', ordenadorPortaria: 'Portaria 12/2026',
  });

  // ---------- licitação 002/2026, homologada e revisada ----------
  const [licLimpeza] = await db.insert(schema.licitacoes).values({
    tenantId, numero: '002/2026', numeroProcesso: 'PA-002/2026', objeto: 'Registro de preços para material de limpeza e EPI', modalidade: 'PREGAO_ELETRONICO', srp: true,
  }).returning();
  const [homLimpeza] = await db.insert(schema.licitacaoHomologacoes).values({
    tenantId, licitacaoId: licLimpeza.id, arquivoNome: 'homologacao_002_2026.xlsx', arquivoPath: '/dev/null', tamanhoBytes: 0, enviadoPor: admin.id, status: 'revisado',
  }).returning();
  const [homLimpaTudo] = await db.insert(schema.homologacaoFornecedores).values({ tenantId, homologacaoId: homLimpeza.id, nomeExtraido: limpaTudo.razaoSocial, cnpjExtraido: limpaTudo.cnpjCpf, fornecedorId: limpaTudo.id }).returning();
  const [homProtege] = await db.insert(schema.homologacaoFornecedores).values({ tenantId, homologacaoId: homLimpeza.id, nomeExtraido: protege.razaoSocial, cnpjExtraido: protege.cnpjCpf, fornecedorId: protege.id }).returning();
  const [detergente, sabao] = await db.insert(schema.homologacaoItens).values([
    // preço com 4 casas: exercita o arredondamento em centavos
    { tenantId, homologacaoFornecedorId: homLimpaTudo.id, numeroItem: 1, descricao: 'Detergente neutro 500 ml', unidade: 'FR', quantidade: '1000', valorUnitario: '2.3456', valorTotal: '2345.60', confiancaExtracao: 'alta' },
    { tenantId, homologacaoFornecedorId: homLimpaTudo.id, numeroItem: 2, descricao: 'Sabão em barra 200 g', unidade: 'UN', quantidade: '500', valorUnitario: '8.90', valorTotal: '4450.00', confiancaExtracao: 'alta' },
  ]).returning();
  const [luvas] = await db.insert(schema.homologacaoItens).values([
    { tenantId, homologacaoFornecedorId: homProtege.id, numeroItem: 3, descricao: 'Luva nitrílica (caixa com 100)', unidade: 'CX', quantidade: '300', valorUnitario: '12.50', valorTotal: '3750.00', confiancaExtracao: 'alta' },
  ]).returning();

  // Ata da Limpa Tudo: distribui o teto entre Saúde (gerenciador) e Educação.
  const ata: any = await atas.create(tenantId, {
    numeroArp: 'ARP 001/2026', licitacaoId: licLimpeza.id, detentorPrincipalId: limpaTudo.id, homologacaoFornecedorId: homLimpaTudo.id,
    vigenciaInicial: '2026-01-01', vigenciaFinal: diaRelativo(365),
    orgaos: [{ secretariaId: saude.id, perfil: 'GERENCIADOR' }, { secretariaId: educacao.id, perfil: 'PARTICIPANTE' }],
  } as any);
  const orgaoSaude = ata.orgaos.find((o: any) => o.secretaria.id === saude.id).id;
  const orgaoEducacao = ata.orgaos.find((o: any) => o.secretaria.id === educacao.id).id;
  const addItemAta = (orgao: string, item: typeof detergente, quantidade: number) =>
    atas.addItem(tenantId, ata.id, orgao, { descricao: item.descricao, unidade: item.unidade!, valorUnitario: Number(item.valorUnitario), quantidade, homologacaoItemId: item.id } as any);
  await addItemAta(orgaoSaude, detergente, 600);
  await addItemAta(orgaoSaude, sabao, 300);
  await addItemAta(orgaoEducacao, detergente, 400);
  await addItemAta(orgaoEducacao, sabao, 200);

  const base = {
    numeroProcesso: 'PA-002/2026', licitacaoId: licLimpeza.id, formaFaturamento: 'SOB_DEMANDA', situacao: 'VIGENTE', vigenciaInicial: '2026-01-01',
  };
  const itemDe = (h: typeof detergente, quantidade: number) => ({ descricao: h.descricao, unidade: h.unidade!, quantidade, valorUnitario: Number(h.valorUnitario), homologacaoItemId: h.id });

  // Contrato 002 — abate da ata (órgão Saúde), com ordens emitida e rascunho.
  const ctrSaude: any = await contratos.create(tenantId, {
    ...base, numero: '002/2026', objeto: 'Material de limpeza para as unidades de saúde', orgaoGerenciadorId: saude.id, fornecedorId: limpaTudo.id,
    ataOrgaoId: orgaoSaude, vigenciaFinal: diaRelativo(180), dotacaoIds: [dotacaoSaude.id], itens: [itemDe(detergente, 300), itemDe(sabao, 100)],
  } as any);
  const itemCtr = (c: any, h: typeof detergente) => c.itens.find((i: any) => i.homologacaoItemId === h.id).id;
  await ordens.create(tenantId, comprador.id, { contratoId: ctrSaude.id, dotacoes: [{ dotacaoId: dotacaoSaude.id }], itens: [{ itemContratoId: itemCtr(ctrSaude, detergente), quantidade: 50 }, { itemContratoId: itemCtr(ctrSaude, sabao), quantidade: 20 }] } as any);
  await ordens.create(tenantId, comprador.id, { contratoId: ctrSaude.id, dotacoes: [{ dotacaoId: dotacaoSaude.id }], itens: [{ itemContratoId: itemCtr(ctrSaude, detergente), quantidade: 1 }] } as any);
  await ordens.create(tenantId, comprador.id, { contratoId: ctrSaude.id, emitirAgora: false, dotacoes: [{ dotacaoId: dotacaoSaude.id }], itens: [{ itemContratoId: itemCtr(ctrSaude, sabao), quantidade: 10 }] } as any);

  // Contrato 003 — direto da homologação (Protege, sem ata), totalmente
  // consumido: contrato, homologação e (sem ata) tetos zerados — pronto para
  // testar aditivo de QUANTIDADE (invariante 6).
  const ctrLuvas: any = await contratos.create(tenantId, {
    ...base, numero: '003/2026', objeto: 'Luvas nitrílicas para a rede de saúde', orgaoGerenciadorId: saude.id, fornecedorId: protege.id,
    homologacaoFornecedorId: homProtege.id, vigenciaFinal: diaRelativo(120), dotacaoIds: [dotacaoSaude.id], itens: [itemDe(luvas, 300)],
  } as any);
  await ordens.create(tenantId, comprador.id, { contratoId: ctrLuvas.id, dotacoes: [{ dotacaoId: dotacaoSaude.id }], itens: [{ itemContratoId: ctrLuvas.itens[0].id, quantidade: 300 }] } as any);

  // Contratos sem origem para testar vigência: um vence HOJE (ainda vale), um
  // venceu ONTEM (emissão bloqueada, salvo configuração).
  const [licManual] = await db.select().from(schema.licitacoes).where(eq(schema.licitacoes.numero, '001/2026'));
  const manual = { numeroProcesso: 'PA-001/2026', licitacaoId: licManual.id, orgaoGerenciadorId: administracao.id, fornecedorId: limpaTudo.id, formaFaturamento: 'SOB_DEMANDA', situacao: 'VIGENTE', vigenciaInicial: '2026-01-01' };
  await contratos.create(tenantId, { ...manual, numero: '004/2026', objeto: 'Contrato que vence hoje (último dia de vigência)', vigenciaFinal: diaRelativo(0), itens: [{ descricao: 'Copo descartável 200 ml (pacote)', unidade: 'PCT', quantidade: 100, valorUnitario: 4.5 }] } as any);
  await contratos.create(tenantId, { ...manual, numero: '005/2026', objeto: 'Contrato vencido ontem', vigenciaFinal: diaRelativo(-1), itens: [{ descricao: 'Guardanapo (pacote)', unidade: 'PCT', quantidade: 100, valorUnitario: 3.2 }] } as any);

  // ---------- licitação 003/2026, homologação aguardando revisão ----------
  const [licAlimentos] = await db.insert(schema.licitacoes).values({
    tenantId, numero: '003/2026', numeroProcesso: 'PA-003/2026', objeto: 'Registro de preços para gêneros alimentícios da merenda', modalidade: 'PREGAO_ELETRONICO', srp: true,
  }).returning();
  const [homAlimentos] = await db.insert(schema.licitacaoHomologacoes).values({
    tenantId, licitacaoId: licAlimentos.id, arquivoNome: 'homologacao_003_2026.xlsx', arquivoPath: '/dev/null', tamanhoBytes: 0, enviadoPor: admin.id, status: 'pronto_para_revisao',
  }).returning();
  const [homAlimForn] = await db.insert(schema.homologacaoFornecedores).values({ tenantId, homologacaoId: homAlimentos.id, nomeExtraido: 'ALIMENTOS BOM PRATO LTDA', cnpjExtraido: '55.444.333/0001-22' }).returning();
  await db.insert(schema.homologacaoItens).values([
    { tenantId, homologacaoFornecedorId: homAlimForn.id, numeroItem: 1, descricao: 'Arroz tipo 1 (5 kg)', unidade: 'PCT', quantidade: '800', valorUnitario: '27.90', valorTotal: '22320.00', confiancaExtracao: 'alta' },
    // falta a unidade de propósito: a revisão precisa apontar e exigir
    { tenantId, homologacaoFornecedorId: homAlimForn.id, numeroItem: 2, descricao: 'Feijão carioca (1 kg)', unidade: null, quantidade: '600', valorUnitario: '8.49', valorTotal: '5094.00', confiancaExtracao: 'media' },
  ]);

  // sequencial de ordens começando num número "de verdade"
  const { proximoNumeroOrdem } = await configuracoes.getOuCriar(tenantId);
  console.log(`Cenário do ambiente de teste aplicado — próximo número de ordem: ${proximoNumeroOrdem}.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
