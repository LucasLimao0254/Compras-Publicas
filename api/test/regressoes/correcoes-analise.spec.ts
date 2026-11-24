import { ArgumentsHost, BadRequestException, ConflictException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import * as schema from '../../src/db/schema';
import { PostgresExceptionFilter } from '../../src/common/postgres-exception.filter';
import { diaIso, formatarDataPura, hojeIso, vigenciaEncerrada } from '../../src/common/datas';
import { ExtracaoHomologacaoService } from '../../src/licitacoes-homologacao/extracao-homologacao.service';
import { preencherMarcadores } from '../../src/minutas/minutas.service';
import { Cenario, Ctx, criarAta, criarCenario, criarCtx, criarContrato, emitirOrdem, encerrarCtx, rejeicao } from '../helpers';

// Regressões dos bugs de datas, erros/segurança e fluxo de itens levantados na
// análise de 07/10/2026 — cada bloco reproduz o cenário que falhava.
describe('Correções da análise de 07/10/2026', () => {
  let ctx: Ctx;
  beforeAll(() => { ctx = criarCtx(); });
  afterAll(() => encerrarCtx(ctx));

  const contratoManual = (c: Cenario, extra: Record<string, unknown> = {}) =>
    ctx.contratos.create(c.tenantId, {
      numero: `M-${Math.random()}`, numeroProcesso: 'p', objeto: 'o', licitacaoId: c.licitacaoId, orgaoGerenciadorId: c.secretariaA, fornecedorId: c.fornecedorId,
      vigenciaInicial: '2026-01-01', vigenciaFinal: '2099-12-31', formaFaturamento: 'MENSAL', situacao: 'VIGENTE',
      itens: [{ descricao: 'x', unidade: 'UN', quantidade: 5, valorUnitario: 1 }], ...extra,
    } as any) as Promise<any>;

  describe('datas de vigência são datas puras', () => {
    it('data pura é formatada no dia certo, independente do fuso do servidor', () => {
      expect(formatarDataPura(new Date('2026-10-07T00:00:00.000Z'))).toBe('07/10/2026');
      expect(diaIso(new Date('2026-10-07T00:00:00.000Z'))).toBe('2026-10-07');
    });

    it('vencido só a partir do dia SEGUINTE ao último dia de vigência', () => {
      const ultimoDia = new Date('2026-10-07T00:00:00.000Z');
      // 22h do dia 6 em Brasília (já é dia 7 em UTC) — ainda nem chegou o último dia
      expect(vigenciaEncerrada(ultimoDia, new Date('2026-10-07T01:00:00.000Z'))).toBe(false);
      // 23h do próprio dia 7 em Brasília — último dia, ainda vigente
      expect(vigenciaEncerrada(ultimoDia, new Date('2026-10-08T02:00:00.000Z'))).toBe(false);
      // 8h do dia 8 em Brasília — agora sim
      expect(vigenciaEncerrada(ultimoDia, new Date('2026-10-08T11:00:00.000Z'))).toBe(true);
    });

    it('emite ordem no último dia de vigência do contrato; no dia seguinte, não', async () => {
      const c = await criarCenario(ctx);
      const hoje: any = await contratoManual(c, { vigenciaFinal: hojeIso() });
      const [it] = await ctx.contratos.itensComSaldo(c.tenantId, hoje.id);
      await emitirOrdem(ctx, c, hoje, [{ itemContratoId: it.id, quantidade: 1 }]);

      const ontemIso = new Date(Date.parse(hojeIso()) - 86_400_000).toISOString().slice(0, 10);
      const ontem: any = await contratoManual(c, { vigenciaFinal: ontemIso });
      const [it2] = await ctx.contratos.itensComSaldo(c.tenantId, ontem.id);
      expect(await rejeicao(emitirOrdem(ctx, c, ontem, [{ itemContratoId: it2.id, quantidade: 1 }]))).toMatch(/vencido/i);
    });
  });

  describe('filtro de erros do Postgres', () => {
    // Intercepta o que o filtro repassa ao tratamento padrão do Nest — com
    // jest.spyOn, restaurado ao fim de cada teste (antes o protótipo da classe
    // base ficava alterado para o resto do arquivo).
    afterEach(() => jest.restoreAllMocks());
    const traduzir = (erro: unknown) => {
      let recebido: unknown;
      const filtro = new PostgresExceptionFilter({ reply: () => undefined, isHeadersSent: () => false, end: () => undefined } as any);
      jest.spyOn(Object.getPrototypeOf(PostgresExceptionFilter.prototype), 'catch').mockImplementation((e: unknown) => { recebido = e; });
      filtro.catch(erro, {} as ArgumentsHost);
      return recebido;
    };
    const erroDoDrizzle = async (p: Promise<unknown>) => p.then(() => { throw new Error('deveria falhar'); }, (e) => e);

    it('violação de unicidade embrulhada pelo Drizzle vira 409', async () => {
      const c = await criarCenario(ctx);
      const erro = await erroDoDrizzle(ctx.db.insert(schema.secretarias).values({ id: c.secretariaA, tenantId: c.tenantId, titulo: 'dup' }));
      expect(traduzir(erro)).toBeInstanceOf(ConflictException);
    });

    it('excluir registro em uso (chave estrangeira) vira 409', async () => {
      const c = await criarCenario(ctx);
      await contratoManual(c);
      const erro = await erroDoDrizzle(ctx.db.delete(schema.fornecedores).where(eq(schema.fornecedores.id, c.fornecedorId)));
      expect(traduzir(erro)).toBeInstanceOf(ConflictException);
    });

    it('id que não é UUID vira 400', async () => {
      const c = await criarCenario(ctx);
      const erro = await erroDoDrizzle(ctx.contratos.get(c.tenantId, 'abc'));
      expect(traduzir(erro)).toBeInstanceOf(BadRequestException);
    });
  });

  describe('ordens', () => {
    it('filtro por número com texto não numérico devolve lista vazia; status inválido é 400', async () => {
      const c = await criarCenario(ctx);
      expect(await ctx.ordens.list(c.tenantId, { numero: 'abc' })).toEqual([]);
      await expect(ctx.ordens.list(c.tenantId, { status: 'XPTO' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita dotação de outro tenant em ordem e em contrato', async () => {
      const c = await criarCenario(ctx);
      const outro = await criarCenario(ctx);
      const [dot] = await ctx.db.insert(schema.dotacoes).values({ tenantId: outro.tenantId, gestaoUnidade: 'OUTRO', fonteRecursos: '1', programaTrabalho: '1' }).returning();
      const ct: any = await contratoManual(c);
      const [it] = await ctx.contratos.itensComSaldo(c.tenantId, ct.id);
      expect(await rejeicao(ctx.ordens.create(c.tenantId, c.usuarioId, { contratoId: ct.id, itens: [{ itemContratoId: it.id, quantidade: 1 }], dotacoes: [{ dotacaoId: dot.id }] } as any))).toMatch(/Dotação/);
      expect(await rejeicao(contratoManual(c, { dotacaoIds: [dot.id] }))).toMatch(/Dotação/);
    });

    it('não deixa recuar o sequencial para um número já usado', async () => {
      const c = await criarCenario(ctx);
      const ct: any = await contratoManual(c);
      const [it] = await ctx.contratos.itensComSaldo(c.tenantId, ct.id);
      const primeira: any = await emitirOrdem(ctx, c, ct, [{ itemContratoId: it.id, quantidade: 1 }]);
      expect(await rejeicao(ctx.configuracoes.update(c.tenantId, { proximoNumeroOrdem: primeira.numero } as any))).toMatch(/maior que/);
      await ctx.configuracoes.update(c.tenantId, { proximoNumeroOrdem: primeira.numero + 10 } as any);
      const segunda: any = await emitirOrdem(ctx, c, ct, [{ itemContratoId: it.id, quantidade: 1 }]);
      expect(segunda.numero).toBe(primeira.numero + 10);
    });

    it('emissões simultâneas recebem números diferentes, sem erro', async () => {
      const c = await criarCenario(ctx);
      const ct: any = await contratoManual(c, { itens: [{ descricao: 'x', unidade: 'UN', quantidade: 100, valorUnitario: 1 }] });
      const [it] = await ctx.contratos.itensComSaldo(c.tenantId, ct.id);
      const ordens: any[] = await Promise.all(Array.from({ length: 6 }, () => emitirOrdem(ctx, c, ct, [{ itemContratoId: it.id, quantidade: 1 }])));
      expect(new Set(ordens.map((o) => o.numero)).size).toBe(6);
    });

    it('cancelar ordem EMITIDA é exclusivo do Administrador; rascunho qualquer usuário descarta', async () => {
      const c = await criarCenario(ctx);
      const ct: any = await contratoManual(c);
      const [it] = await ctx.contratos.itensComSaldo(c.tenantId, ct.id);
      const emitida: any = await emitirOrdem(ctx, c, ct, [{ itemContratoId: it.id, quantidade: 1 }]);
      expect(await rejeicao(ctx.ordens.cancelar(c.tenantId, c.usuarioId, 'PADRAO', emitida.id))).toMatch(/administradores/);
      expect((await ctx.ordens.cancelar(c.tenantId, c.usuarioId, 'ADMIN', emitida.id))!.status).toBe('CANCELADA');

      const rascunho: any = await ctx.ordens.create(c.tenantId, c.usuarioId, { contratoId: ct.id, emitirAgora: false, itens: [{ itemContratoId: it.id, quantidade: 1 }] } as any);
      expect((await ctx.ordens.cancelar(c.tenantId, c.usuarioId, 'PADRAO', rascunho.id))!.status).toBe('CANCELADA');
    });
  });

  describe('atas', () => {
    const dtoAta = (c: Cenario, numeroArp: string, orgaos: any[]) => ({
      numeroArp, licitacaoId: c.licitacaoId, detentorPrincipalId: c.fornecedorId, homologacaoFornecedorId: c.homologacaoFornecedorId,
      vigenciaInicial: '2026-01-01', vigenciaFinal: '2099-12-31', orgaos,
    }) as any;

    it('secretaria repetida é recusada sem deixar ata gravada — dá para tentar de novo', async () => {
      const c = await criarCenario(ctx);
      expect(await rejeicao(ctx.atas.create(c.tenantId, dtoAta(c, 'ARP-1', [{ secretariaId: c.secretariaA, perfil: 'GERENCIADOR' }, { secretariaId: c.secretariaA, perfil: 'PARTICIPANTE' }])))).toMatch(/mais de uma vez/);
      expect(await ctx.db.select().from(schema.atas).where(eq(schema.atas.tenantId, c.tenantId))).toHaveLength(0);
      await ctx.atas.create(c.tenantId, dtoAta(c, 'ARP-1', [{ secretariaId: c.secretariaA, perfil: 'GERENCIADOR' }]));
    });

    it('importação em lote é tudo-ou-nada', async () => {
      const c = await criarCenario(ctx);
      const ata = await criarAta(ctx, c);
      const itens = [
        { descricao: 'Item 1 homologado', unidade: 'UN', valorUnitario: 10, quantidade: 40, homologacaoItemId: c.item1 },
        { descricao: 'Item 2 homologado', unidade: 'CX', valorUnitario: 20, quantidade: 999, homologacaoItemId: c.item2 }, // acima do teto de 50
      ];
      await rejeicao(ctx.atas.addItens(c.tenantId, ata.ataId, ata.orgaoA, itens as any));
      expect(await ctx.atas.itensDoOrgao(c.tenantId, ata.ataId, ata.orgaoA)).toHaveLength(0);
    });

    it('distribui um item entre dois órgãos e mantém o número do item da licitação', async () => {
      const c = await criarCenario(ctx);
      const ata = await criarAta(ctx, c);
      const item2 = (quantidade: number) => [{ descricao: 'Item 2 homologado', unidade: 'CX', valorUnitario: 20, quantidade, homologacaoItemId: c.item2 }] as any;
      await ctx.atas.addItens(c.tenantId, ata.ataId, ata.orgaoA, item2(30));
      await ctx.atas.addItens(c.tenantId, ata.ataId, ata.orgaoB, item2(20));
      const [a] = await ctx.atas.itensDoOrgao(c.tenantId, ata.ataId, ata.orgaoA);
      const [b] = await ctx.atas.itensDoOrgao(c.tenantId, ata.ataId, ata.orgaoB);
      // item 2 da licitação continua sendo o item 2 nos dois órgãos, mesmo sendo o primeiro (e único) item de cada um
      expect([a.numeroItem, b.numeroItem]).toEqual([2, 2]);

      const disponiveis: any[] = await ctx.homologacao.itensParaImportar(c.tenantId, c.licitacaoId, c.fornecedorId);
      expect(disponiveis.find((i) => i.homologacaoItemId === c.item2)).toMatchObject({ numeroItem: 2, quantidade: 50, quantidadeDisponivel: 0 });
      expect(disponiveis.find((i) => i.homologacaoItemId === c.item1)).toMatchObject({ numeroItem: 1, quantidadeDisponivel: 100 });
    });

    it('o mesmo item homologado não entra duas vezes no mesmo órgão', async () => {
      const c = await criarCenario(ctx);
      const ata = await criarAta(ctx, c, [{ orgao: 'A', item: 'item1', quantidade: 0 }]);
      expect(await rejeicao(ctx.atas.addItem(c.tenantId, ata.ataId, ata.orgaoA, { descricao: 'Item 1 homologado', unidade: 'UN', valorUnitario: 10, quantidade: 40, homologacaoItemId: c.item1 } as any))).toMatch(/já está neste órgão/);
    });

    it('item de contrato vindo da homologação mantém o número da licitação', async () => {
      const c = await criarCenario(ctx);
      const ct = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item2', quantidade: 5 }] });
      const [it] = await ctx.contratos.itensComSaldo(c.tenantId, ct.id);
      expect(it.numero).toBe(2);
    });
  });

  describe('extração da planilha de homologação', () => {
    const planilha = (linhas: unknown[][]) => {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), 'a');
      return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    };
    const cabecalho = ['ITEM', 'QUANTIDADE', 'UNIDADE', 'DESCRIÇÃO', 'MARCA', 'MODELO', 'UNITÁRIO ADJUDICADO'];
    const bloco = (fornecedor: string, n: number, descricao: string) => [[fornecedor], cabecalho, [n, '1,00', 'UN', descricao, '', '', 'R$ 1,00']];

    it('reconhece CNPJ sem máscara e CPF — cada fornecedor fica com os seus itens', async () => {
      const r = await new ExtracaoHomologacaoService().extrair(planilha([
        ...bloco('Fornecedor: ALFA LTDA - 11.111.111/0001-11', 1, 'Caneta'),
        ...bloco('Fornecedor: BETA LTDA - 22222222000122', 2, 'Notebook'),
        ...bloco('Fornecedor: JOAO DA SILVA - 123.456.789-00', 3, 'Serviço'),
      ]));
      expect(r.fornecedores.map((f) => [f.nome, f.itens.map((i) => i.descricao)])).toEqual([
        ['ALFA LTDA', ['Caneta']], ['BETA LTDA', ['Notebook']], ['JOAO DA SILVA', ['Serviço']],
      ]);
    });

    it('bloco de fornecedor ilegível interrompe a extração, citando a linha', async () => {
      const buffer = planilha([
        ...bloco('Fornecedor: ALFA LTDA - 11.111.111/0001-11', 1, 'Caneta'),
        ...bloco('Fornecedor: BETA LTDA (sem documento)', 2, 'Notebook'),
      ]);
      await expect(new ExtracaoHomologacaoService().extrair(buffer)).rejects.toThrow(/Linha 4/);
    });
  });

  describe('minutas', () => {
    const p = (...trechos: string[]) => `<w:p><w:pPr/>${trechos.map((t) => `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${t}</w:t></w:r>`).join('')}</w:p>`;
    const texto = (xml: string) => [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');

    it('substitui marcador que o Word partiu em vários trechos de formatação', () => {
      const xml = p('Contrato nº {{numero_', 'contrato', '}} firmado com {{fornecedor_razao_social}}.');
      const saida = preencherMarcadores(xml, { numero_contrato: '010/2026', fornecedor_razao_social: 'A & B Ltda' });
      expect(texto(saida)).toBe('Contrato nº 010/2026 firmado com A &amp; B Ltda.');
      expect(saida.match(/<w:r>/g)).toHaveLength(3); // os trechos (e a formatação deles) continuam lá
    });

    it('marcador desconhecido fica como está', () => {
      expect(texto(preencherMarcadores(p('Olá {{nao_existe}}'), {}))).toBe('Olá {{nao_existe}}');
    });
  });
});
