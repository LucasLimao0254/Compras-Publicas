import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../src/db/schema';
import { DrizzleDB } from '../src/db/db.module';
import { AditivosService } from '../src/aditivos/aditivos.service';
import { ApostilamentosService } from '../src/apostilamentos/apostilamentos.service';
import { AtasService } from '../src/atas/atas.service';
import { ConfiguracoesService } from '../src/configuracoes/configuracoes.service';
import { ContratosService } from '../src/contratos/contratos.service';
import { LicitacoesHomologacaoService } from '../src/licitacoes-homologacao/licitacoes-homologacao.service';
import { ExtracaoHomologacaoService } from '../src/licitacoes-homologacao/extracao-homologacao.service';
import { OrdensService } from '../src/ordens/ordens.service';
import { SaldoCeilingService } from '../src/saldo-ceiling/saldo-ceiling.service';
import { TEST_DB_URL } from './config';

// Os serviços são instanciados à mão (sem o container do Nest): os construtores
// são poucos e simples, e isso mantém os testes rápidos e sem magia de DI.
export interface Ctx {
  pool: Pool;
  db: DrizzleDB;
  saldo: SaldoCeilingService;
  configuracoes: ConfiguracoesService;
  contratos: ContratosService;
  atas: AtasService;
  aditivos: AditivosService;
  apostilamentos: ApostilamentosService;
  ordens: OrdensService;
  homologacao: LicitacoesHomologacaoService;
}

export function criarCtx(): Ctx {
  const pool = new Pool({ connectionString: TEST_DB_URL });
  const db = drizzle(pool, { schema }) as unknown as DrizzleDB;
  const saldo = new SaldoCeilingService();
  const configuracoes = new ConfiguracoesService(db);
  const contratos = new ContratosService(db, saldo);
  return {
    pool,
    db,
    saldo,
    configuracoes,
    contratos,
    atas: new AtasService(db, saldo, contratos),
    aditivos: new AditivosService(db, contratos, saldo),
    apostilamentos: new ApostilamentosService(db),
    ordens: new OrdensService(db, configuracoes),
    homologacao: new LicitacoesHomologacaoService(db, new ExtracaoHomologacaoService(), saldo),
  };
}

export async function encerrarCtx(ctx: Ctx) {
  await ctx.pool.end();
}

let seq = 0;
const unico = () => `${Date.now().toString(36)}${(seq++).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

// Cenário base de cada teste: um tenant próprio (isolamento por tenantId, mesma
// regra do código de produção), com uma licitação já homologada e REVISADA para
// um fornecedor, tendo dois itens de teto conhecido. Inserido direto no banco —
// o upload/extração de planilha tem cobertura própria e não é o que se testa aqui.
export const TETO_ITEM_1 = 100; // valor unitário 10
export const TETO_ITEM_2 = 50; //  valor unitário 20
export const VALOR_ITEM_1 = 10;
export const VALOR_ITEM_2 = 20;

export interface Cenario {
  tenantId: string;
  usuarioId: string;
  secretariaA: string;
  secretariaB: string;
  fornecedorId: string;
  licitacaoId: string;
  homologacaoId: string;
  homologacaoFornecedorId: string;
  item1: string; // homologacaoItens.id (teto 100, R$ 10)
  item2: string; // homologacaoItens.id (teto 50, R$ 20)
}

export async function criarCenario(ctx: Ctx, opts: { status?: 'revisado' | 'pronto_para_revisao' } = {}): Promise<Cenario> {
  const { db } = ctx;
  const u = unico();
  const [tenant] = await db
    .insert(schema.tenants)
    .values({ codigo: Math.floor(Math.random() * 2_000_000_000), nome: `Tenant ${u}` })
    .returning();
  const tenantId = tenant.id;

  const [usuario] = await db
    .insert(schema.usuarios)
    .values({ tenantId, cpf: u.slice(0, 11), nome: 'Admin Teste', email: `admin-${u}@teste.gov.br`, senhaHash: 'x', tipoUsuario: 'ADMIN' })
    .returning();

  const [secretariaA] = await db.insert(schema.secretarias).values({ tenantId, titulo: 'Secretaria A' }).returning();
  const [secretariaB] = await db.insert(schema.secretarias).values({ tenantId, titulo: 'Secretaria B' }).returning();
  const [fornecedor] = await db
    .insert(schema.fornecedores)
    .values({ tenantId, cnpjCpf: `00.000.000/${u.slice(0, 4)}-00`, razaoSocial: 'Fornecedor Teste Ltda' })
    .returning();
  const [licitacao] = await db
    .insert(schema.licitacoes)
    .values({ tenantId, numero: `LIC-${u}`, numeroProcesso: `PA-${u}`, objeto: 'Objeto da licitação', modalidade: 'PREGAO_ELETRONICO', srp: true })
    .returning();

  const [homologacao] = await db
    .insert(schema.licitacaoHomologacoes)
    .values({
      tenantId,
      licitacaoId: licitacao.id,
      arquivoNome: 'homologacao.xlsx',
      arquivoPath: '/dev/null',
      tamanhoBytes: 0,
      enviadoPor: usuario.id,
      status: opts.status ?? 'revisado',
    })
    .returning();
  const [homFornecedor] = await db
    .insert(schema.homologacaoFornecedores)
    .values({ tenantId, homologacaoId: homologacao.id, nomeExtraido: fornecedor.razaoSocial, cnpjExtraido: fornecedor.cnpjCpf, fornecedorId: fornecedor.id })
    .returning();
  const itens = await db
    .insert(schema.homologacaoItens)
    .values([
      { tenantId, homologacaoFornecedorId: homFornecedor.id, numeroItem: 1, descricao: 'Item 1 homologado', unidade: 'UN', quantidade: String(TETO_ITEM_1), valorUnitario: String(VALOR_ITEM_1) },
      { tenantId, homologacaoFornecedorId: homFornecedor.id, numeroItem: 2, descricao: 'Item 2 homologado', unidade: 'CX', quantidade: String(TETO_ITEM_2), valorUnitario: String(VALOR_ITEM_2) },
    ])
    .returning();
  const item1 = itens.find((i) => i.numeroItem === 1)!;
  const item2 = itens.find((i) => i.numeroItem === 2)!;

  // Dotação não é o assunto dos invariantes; desliga a obrigatoriedade para os
  // testes de ordem não precisarem montar uma.
  await ctx.configuracoes.update(tenantId, { dotacaoObrigatoria: false });

  return {
    tenantId,
    usuarioId: usuario.id,
    secretariaA: secretariaA.id,
    secretariaB: secretariaB.id,
    fornecedorId: fornecedor.id,
    licitacaoId: licitacao.id,
    homologacaoId: homologacao.id,
    homologacaoFornecedorId: homFornecedor.id,
    item1: item1.id,
    item2: item2.id,
  };
}

const DADOS_ITEM: Record<'item1' | 'item2', { descricao: string; unidade: string; valorUnitario: number }> = {
  item1: { descricao: 'Item 1 homologado', unidade: 'UN', valorUnitario: VALOR_ITEM_1 },
  item2: { descricao: 'Item 2 homologado', unidade: 'CX', valorUnitario: VALOR_ITEM_2 },
};

export interface AtaCriada {
  ataId: string;
  orgaoA: string;
  orgaoB: string;
}

// Cria uma ata do fornecedor homologado, com os dois órgãos (A gerenciador, B
// participante). `distribuicao` reserva quantidade de cada item em cada órgão.
export async function criarAta(
  ctx: Ctx,
  c: Cenario,
  distribuicao: { orgao: 'A' | 'B'; item: 'item1' | 'item2'; quantidade: number }[] = [],
): Promise<AtaCriada> {
  const u = unico();
  const ata: any = await ctx.atas.create(c.tenantId, {
    numeroArp: `ARP-${u}`,
    licitacaoId: c.licitacaoId,
    detentorPrincipalId: c.fornecedorId,
    homologacaoFornecedorId: c.homologacaoFornecedorId,
    vigenciaInicial: '2026-01-01',
    vigenciaFinal: '2099-12-31',
    orgaos: [
      { secretariaId: c.secretariaA, perfil: 'GERENCIADOR' },
      { secretariaId: c.secretariaB, perfil: 'PARTICIPANTE' },
    ],
  } as any);
  const orgaoA = ata.orgaos.find((o: any) => o.secretaria.id === c.secretariaA).id;
  const orgaoB = ata.orgaos.find((o: any) => o.secretaria.id === c.secretariaB).id;
  for (const d of distribuicao) {
    await ctx.atas.addItem(c.tenantId, ata.id, d.orgao === 'A' ? orgaoA : orgaoB, {
      ...DADOS_ITEM[d.item],
      quantidade: d.quantidade,
      homologacaoItemId: c[d.item],
    } as any);
  }
  return { ataId: ata.id, orgaoA, orgaoB };
}

export interface ContratoOpts {
  origem: { ataOrgaoId: string } | { homologacaoFornecedorId: string } | 'nenhuma';
  itens: { item: 'item1' | 'item2'; quantidade: number }[];
  formaControleSaldo?: string;
  situacao?: string;
}

export async function criarContrato(ctx: Ctx, c: Cenario, o: ContratoOpts): Promise<any> {
  const u = unico();
  return ctx.contratos.create(c.tenantId, {
    numero: `CTR-${u}`,
    numeroProcesso: `PA-${u}`,
    objeto: 'Objeto do contrato',
    licitacaoId: c.licitacaoId,
    orgaoGerenciadorId: c.secretariaA,
    fornecedorId: c.fornecedorId,
    ...(o.origem === 'nenhuma' ? {} : o.origem),
    vigenciaInicial: '2026-01-01',
    vigenciaFinal: '2099-12-31',
    formaFaturamento: 'MENSAL',
    formaControleSaldo: o.formaControleSaldo,
    situacao: o.situacao ?? 'VIGENTE',
    itens: o.itens.map((i) => ({
      ...DADOS_ITEM[i.item],
      quantidade: i.quantidade,
      // itens só rastreiam homologação quando o contrato tem origem
      ...(o.origem === 'nenhuma' ? {} : { homologacaoItemId: c[i.item] }),
    })),
  } as any);
}

// Emite uma ordem contra um contrato, cobrindo os itens/quantidades pedidos.
export async function emitirOrdem(ctx: Ctx, c: Cenario, contrato: any, itens: { itemContratoId: string; quantidade: number }[]): Promise<any> {
  return ctx.ordens.create(c.tenantId, c.usuarioId, { contratoId: contrato.id, itens } as any);
}

// Consome TODO o saldo do contrato emitindo uma ordem com a quantidade
// integral de cada item — deixa o contrato em saldo zero.
export async function esgotarContrato(ctx: Ctx, c: Cenario, contratoId: string): Promise<void> {
  const itens = await ctx.contratos.itensComSaldo(c.tenantId, contratoId);
  await ctx.ordens.create(c.tenantId, c.usuarioId, {
    contratoId,
    itens: itens.filter((i) => i.quantidadeDisponivel > 0).map((i) => ({ itemContratoId: i.id, quantidade: i.quantidadeDisponivel })),
  } as any);
}

export const dadosAditivo = (extra: Record<string, unknown>) => ({
  numero: `TA-${unico()}`,
  dataAssinatura: '2026-06-01',
  fundamentoLegal: 'Art. 124, Lei 14.133/2021',
  justificativa: 'Teste de invariante',
  ...extra,
});

// Rejeição esperada: devolve a mensagem da exceção (ou falha o teste se a
// operação foi aceita).
export async function rejeicao(promessa: Promise<unknown>): Promise<string> {
  try {
    await promessa;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  throw new Error('A operação deveria ter sido rejeitada, mas foi aceita');
}

// CPF válido (com dígitos verificadores) para testes que criam usuário pelo
// service, que recusa CPF inválido.
let seqCpf = 0;
export function gerarCpf(): string {
  const base = String(100000000 + ((Date.now() + seqCpf++ * 7919) % 899999999)).slice(0, 9);
  const digito = (b: string) => {
    const soma = b.split('').reduce((acc, d, i) => acc + Number(d) * (b.length + 1 - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = digito(base);
  return base + d1 + digito(base + d1);
}
