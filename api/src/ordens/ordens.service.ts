import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../db/db.module';
import { ConfiguracoesService } from '../configuracoes/configuracoes.service';
import {
  contadores,
  contratos,
  itensContrato,
  itensOrdem,
  ordemDotacoes,
  ordemHistorico,
  ordens,
  unidadesExecutoras,
} from '../db/schema';
import { CreateOrdemDto, UpdateOrdemDto } from './dto/ordem.dto';

type ItemCalculado = { itemContratoId: string; quantidade: string; precoUnitario: string; precoTotal: string };
type LinhaArmazenada = { itemContratoId: string | null; quantidade: string };

// Letra de exibição estilo planilha (A, B, ..., Z, AA, AB, ...) — usada para
// compor o número exibido de uma ordem como "{número do contrato} {letra}"
// (ex.: "010/2026 A"), a N-ésima ordem emitida contra aquele contrato.
function letraSeq(n: number): string {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export interface ListaOrdensFiltro {
  status?: string;
  numero?: string;
  licitacaoId?: string;
  contratoId?: string;
  secretariaId?: string;
  fornecedorId?: string;
}

@Injectable()
export class OrdensService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB, private configuracoes: ConfiguracoesService) {}

  async list(tenantId: string, filtro: ListaOrdensFiltro = {}) {
    const condicoes = [eq(ordens.tenantId, tenantId)];
    if (filtro.status) condicoes.push(eq(ordens.status, filtro.status as any));
    if (filtro.numero) condicoes.push(eq(ordens.numero, Number(filtro.numero)));
    if (filtro.contratoId) condicoes.push(eq(ordens.contratoId, filtro.contratoId));
    if (filtro.licitacaoId) condicoes.push(eq(contratos.licitacaoId, filtro.licitacaoId));
    if (filtro.secretariaId) condicoes.push(eq(contratos.orgaoGerenciadorId, filtro.secretariaId));
    if (filtro.fornecedorId) condicoes.push(eq(contratos.fornecedorId, filtro.fornecedorId));

    const rows = await this.db
      .select({ id: ordens.id })
      .from(ordens)
      .leftJoin(contratos, eq(ordens.contratoId, contratos.id))
      .where(and(...condicoes));

    const ids = rows.map((r) => r.id);
    if (!ids.length) return [];

    const linhas = await this.db.query.ordens.findMany({
      where: inArray(ordens.id, ids),
      with: {
        contrato: { with: { fornecedor: true } },
        unidadeExecutora: true,
        itens: true,
        dotacoes: { with: { dotacao: true } },
      },
      orderBy: (o, { desc }) => [desc(o.createdAt)],
    });
    return this.comNumeroExibicao(tenantId, linhas);
  }

  // Rótulo de exibição "{número do contrato} {letra}" (ex.: "010/2026 A") —
  // a letra é a posição sequencial da ordem entre as demais do mesmo
  // contrato, calculada contra TODAS as ordens daquele contrato (não só as
  // da página/filtro atual), senão a letra mudaria dependendo do filtro
  // aplicado.
  private async comNumeroExibicao<T extends { id: string; numero: number; contratoId: string | null; contrato: { numero: string } | null }>(tenantId: string, linhas: T[]) {
    const contratoIds = Array.from(new Set(linhas.map((o) => o.contratoId).filter((v): v is string => !!v)));
    if (!contratoIds.length) {
      return linhas.map((o) => ({ ...o, numeroExibicao: null as string | null }));
    }

    const todas = await this.db
      .select({ id: ordens.id, numero: ordens.numero, contratoId: ordens.contratoId })
      .from(ordens)
      .where(and(eq(ordens.tenantId, tenantId), inArray(ordens.contratoId, contratoIds)));

    const porContrato = new Map<string, typeof todas>();
    for (const o of todas) {
      if (!o.contratoId) continue;
      if (!porContrato.has(o.contratoId)) porContrato.set(o.contratoId, []);
      porContrato.get(o.contratoId)!.push(o);
    }
    const letraPorId = new Map<string, string>();
    for (const lista of porContrato.values()) {
      lista.sort((a, b) => a.numero - b.numero);
      lista.forEach((o, idx) => letraPorId.set(o.id, letraSeq(idx + 1)));
    }

    return linhas.map((o) => {
      const letra = letraPorId.get(o.id);
      return { ...o, numeroExibicao: o.contrato && letra ? `${o.contrato.numero} ${letra}` : null };
    });
  }

  async get(tenantId: string, id: string) {
    const row = await this.findDetalhada(this.db, tenantId, id);
    if (!row) throw new NotFoundException('Ordem não encontrada');
    return row;
  }

  // Usado tanto fora quanto dentro de uma transação: dentro de uma tx aberta,
  // uma leitura pela conexão "this.db" (fora da tx) não enxergaria a linha
  // recém-inserida ainda não commitada — por isso este helper aceita
  // explicitamente qual conexão (db normal ou tx) usar.
  private findDetalhada(dbOrTx: DrizzleDB, tenantId: string, id: string) {
    return dbOrTx.query.ordens.findFirst({
      where: and(eq(ordens.tenantId, tenantId), eq(ordens.id, id)),
      with: {
        contrato: { with: { fornecedor: true } },
        unidadeExecutora: true,
        itens: { with: { itemContrato: true } },
        dotacoes: { with: { dotacao: true } },
      },
    });
  }

  // Contador sequencial por tenant — cria com valor inicial 1 na primeira ordem.
  private async proximoNumero(tx: DrizzleDB, tenantId: string) {
    const [contador] = await tx.select().from(contadores).where(eq(contadores.tenantId, tenantId));
    if (!contador) {
      await tx.insert(contadores).values({ tenantId, proximaOrdem: 2 });
      return 1;
    }
    await tx.update(contadores).set({ proximaOrdem: contador.proximaOrdem + 1 }).where(eq(contadores.tenantId, tenantId));
    return contador.proximaOrdem;
  }

  // Emite uma ordem a partir de um contrato — ordem só nasce de contrato (ver
  // MODELO.md, seção 2): valida saldo item a item, obtém o próximo número
  // sequencial do tenant e grava tudo em uma transação — ou fecha por
  // completo, ou não decrementa saldo nenhum. Se emitirAgora=false, a ordem
  // nasce como RASCUNHO: os preços dos itens já são calculados,
  // mas a checagem/decremento de saldo só acontece em emitir().
  async create(tenantId: string, usuarioId: string, dto: CreateOrdemDto) {
    const config = await this.configuracoes.getOuCriar(tenantId);
    if (config.dotacaoObrigatoria && !dto.dotacoes?.length) {
      throw new BadRequestException('Selecione ao menos uma dotação orçamentária');
    }

    const emitirAgora = dto.emitirAgora ?? true;

    return this.db.transaction(async (tx) => {
      if (dto.unidadeExecutoraId) {
        const [unidade] = await tx.select({ id: unidadesExecutoras.id }).from(unidadesExecutoras).where(and(eq(unidadesExecutoras.id, dto.unidadeExecutoraId), eq(unidadesExecutoras.tenantId, tenantId)));
        if (!unidade) throw new BadRequestException('Unidade executora não encontrada para este tenant');
      }

      const { itensCalculados } = await this.validarOrigemContrato(tx, tenantId, dto, emitirAgora, config.permitirOrdemContratoVencido);

      const numero = await this.proximoNumero(tx, tenantId);

      const [ordem] = await tx
        .insert(ordens)
        .values({ tenantId, numero, unidadeExecutoraId: dto.unidadeExecutoraId, status: emitirAgora ? 'EMITIDA' : 'RASCUNHO', contratoId: dto.contratoId })
        .returning();

      await tx.insert(itensOrdem).values(itensCalculados.map((it) => ({ ordemId: ordem.id, ...it })));

      if (dto.dotacoes?.length) {
        await tx.insert(ordemDotacoes).values(
          dto.dotacoes.map((d) => ({
            tenantId,
            ordemId: ordem.id,
            dotacaoId: d.dotacaoId,
            valorRateado: d.valorRateado != null ? String(d.valorRateado) : null,
          })),
        );
      }

      await tx.insert(ordemHistorico).values({
        tenantId,
        ordemId: ordem.id,
        tipoEvento: 'cadastrou',
        usuarioId,
        dadosSnapshot: { itens: itensCalculados, dotacoes: dto.dotacoes ?? [] },
      });
      if (emitirAgora) {
        await tx.insert(ordemHistorico).values({ tenantId, ordemId: ordem.id, tipoEvento: 'emitiu_ordem', usuarioId });
      }

      return this.findDetalhada(tx as unknown as DrizzleDB, tenantId, ordem.id);
    });
  }

  private async validarOrigemContrato(tx: DrizzleDB, tenantId: string, dto: CreateOrdemDto, validarSaldo: boolean, permitirVencido: boolean) {
    const [contrato] = await tx.select().from(contratos).where(and(eq(contratos.tenantId, tenantId), eq(contratos.id, dto.contratoId)));
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    if (contrato.situacao === 'ARQUIVADO' || contrato.situacao === 'MINUTA') {
      throw new BadRequestException('Não é possível emitir ordem para um contrato arquivado ou em minuta');
    }
    if (!permitirVencido && new Date(contrato.vigenciaFinal) < new Date()) {
      throw new BadRequestException('Contrato vencido: emissão de ordens bloqueada (habilite em Configurações se necessário)');
    }

    // Agrega linhas repetidas do mesmo item (bug de client / clique duplo) para
    // que a validação de saldo veja a quantidade total pedida, não cada linha
    // isoladamente — senão duas linhas do mesmo item podem passar individualmente
    // e juntas estourar o saldo.
    const quantidadePorItem = new Map<string, number>();
    for (const linha of dto.itens) {
      quantidadePorItem.set(linha.itemContratoId, (quantidadePorItem.get(linha.itemContratoId) ?? 0) + linha.quantidade);
    }

    const itensCalculados: ItemCalculado[] = [];

    for (const [itemContratoId, quantidade] of quantidadePorItem) {
      // SELECT ... FOR UPDATE trava a linha do item pelo resto da transação:
      // duas emissões concorrentes para o mesmo item serializam aqui em vez de
      // ambas lerem o mesmo saldo disponível e passarem na validação. Um
      // rascunho (validarSaldo=false) não consome nada ainda, então não
      // precisa da trava.
      const [item] = validarSaldo
        ? await tx.select().from(itensContrato).where(eq(itensContrato.id, itemContratoId)).for('update')
        : await tx.select().from(itensContrato).where(eq(itensContrato.id, itemContratoId));
      if (!item || item.contratoId !== dto.contratoId) {
        throw new BadRequestException('Item não pertence ao contrato selecionado');
      }

      if (validarSaldo) {
        const [usadoRow] = await tx
          .select({ total: sql<string>`coalesce(sum(${itensOrdem.quantidade}), 0)` })
          .from(itensOrdem)
          .innerJoin(ordens, eq(itensOrdem.ordemId, ordens.id))
          .where(and(eq(ordens.contratoId, dto.contratoId), eq(ordens.status, 'EMITIDA'), eq(itensOrdem.itemContratoId, item.id)));

        const usado = Number(usadoRow?.total ?? 0);
        const disponivel = Number(item.quantidade) - usado;
        if (quantidade > disponivel) {
          throw new BadRequestException(
            `Quantidade solicitada para "${item.descricao}" (${quantidade}) excede o saldo disponível (${disponivel})`,
          );
        }
      }

      const precoUnitario = Number(item.valorUnitario);
      itensCalculados.push({
        itemContratoId: item.id,
        quantidade: String(quantidade),
        precoUnitario: String(precoUnitario),
        precoTotal: (precoUnitario * quantidade).toFixed(2),
      });
    }

    return { itensCalculados };
  }

  // Efetiva uma ordem em RASCUNHO: só agora a checagem/decremento de saldo
  // roda de fato, contra as quantidades já gravadas na criação do rascunho.
  async emitir(tenantId: string, usuarioId: string, id: string) {
    const config = await this.configuracoes.getOuCriar(tenantId);
    return this.db.transaction(async (tx) => {
      const [ordem] = await tx.select().from(ordens).where(and(eq(ordens.tenantId, tenantId), eq(ordens.id, id)));
      if (!ordem) throw new NotFoundException('Ordem não encontrada');
      if (ordem.status !== 'RASCUNHO') {
        throw new BadRequestException('Somente uma ordem em rascunho pode ser emitida');
      }

      const linhas = await tx.select().from(itensOrdem).where(eq(itensOrdem.ordemId, id));
      await this.revalidarSaldoContrato(tx, ordem.contratoId!, linhas, config.permitirOrdemContratoVencido);

      await tx.update(ordens).set({ status: 'EMITIDA' }).where(and(eq(ordens.id, id), eq(ordens.tenantId, tenantId)));
      await tx.insert(ordemHistorico).values({ tenantId, ordemId: id, tipoEvento: 'emitiu_ordem', usuarioId });

      return this.findDetalhada(tx as unknown as DrizzleDB, tenantId, id);
    });
  }

  private async revalidarSaldoContrato(tx: DrizzleDB, contratoId: string, linhas: LinhaArmazenada[], permitirVencido: boolean) {
    const [contrato] = await tx.select().from(contratos).where(eq(contratos.id, contratoId));
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    if (contrato.situacao === 'ARQUIVADO' || contrato.situacao === 'MINUTA') {
      throw new BadRequestException('Não é possível emitir ordem para um contrato arquivado ou em minuta');
    }
    if (!permitirVencido && new Date(contrato.vigenciaFinal) < new Date()) {
      throw new BadRequestException('Contrato vencido: emissão de ordens bloqueada (habilite em Configurações se necessário)');
    }

    for (const linha of linhas) {
      const [item] = await tx.select().from(itensContrato).where(eq(itensContrato.id, linha.itemContratoId!)).for('update');
      if (!item) throw new BadRequestException('Item do contrato não encontrado');

      const [usadoRow] = await tx
        .select({ total: sql<string>`coalesce(sum(${itensOrdem.quantidade}), 0)` })
        .from(itensOrdem)
        .innerJoin(ordens, eq(itensOrdem.ordemId, ordens.id))
        .where(and(eq(ordens.contratoId, contratoId), eq(ordens.status, 'EMITIDA'), eq(itensOrdem.itemContratoId, item.id)));

      const usado = Number(usadoRow?.total ?? 0);
      const disponivel = Number(item.quantidade) - usado;
      if (Number(linha.quantidade) > disponivel) {
        throw new BadRequestException(
          `Quantidade solicitada para "${item.descricao}" (${linha.quantidade}) excede o saldo disponível (${disponivel})`,
        );
      }
    }
  }

  // Edição pós-emissão, restrita a Administrador do tenant — regra de
  // aplicação além do @RequirePermission('compras.ordens') do módulo inteiro
  // (mesmo padrão de "gate mais fino que o módulo" já usado nesta sessão pro
  // pré-check de aditivos). Só quantidade muda (preço unitário permanece o
  // snapshotado na emissão); a revalidação de saldo exclui o consumo da
  // própria ordem, senão o teto compararia contra si mesmo.
  async update(tenantId: string, usuarioId: string, tipoUsuario: 'ADMIN' | 'PADRAO', id: string, dto: UpdateOrdemDto) {
    if (tipoUsuario !== 'ADMIN') {
      throw new ForbiddenException('Somente administradores do tenant podem editar uma ordem já emitida');
    }

    const config = await this.configuracoes.getOuCriar(tenantId);

    return this.db.transaction(async (tx) => {
      const [ordem] = await tx.select().from(ordens).where(and(eq(ordens.tenantId, tenantId), eq(ordens.id, id))).for('update');
      if (!ordem) throw new NotFoundException('Ordem não encontrada');
      if (ordem.status !== 'EMITIDA') throw new BadRequestException('Só é possível editar uma ordem emitida');

      // Mesma checagem de elegibilidade que emitir()/revalidarSaldoContrato
      // fazem — sem isso, editar era um jeito de aumentar o consumo de um
      // contrato arquivado/vencido mesmo com a emissão de ordens novas já
      // bloqueada para ele.
      const [contrato] = await tx.select().from(contratos).where(eq(contratos.id, ordem.contratoId!));
      if (!contrato) throw new NotFoundException('Contrato não encontrado');
      if (contrato.situacao === 'ARQUIVADO' || contrato.situacao === 'MINUTA') {
        throw new BadRequestException('Não é possível editar ordem de um contrato arquivado ou em minuta');
      }
      if (!config.permitirOrdemContratoVencido && new Date(contrato.vigenciaFinal) < new Date()) {
        throw new BadRequestException('Contrato vencido: edição de ordens bloqueada (habilite em Configurações se necessário)');
      }

      const linhasAtuais = await tx.select().from(itensOrdem).where(eq(itensOrdem.ordemId, id));
      const linhaPorId = new Map(linhasAtuais.map((l) => [l.id, l]));
      const antes = linhasAtuais.map((l) => ({ itensOrdemId: l.id, quantidade: l.quantidade }));
      const depois: { itensOrdemId: string; quantidade: string }[] = [];

      for (const alteracao of dto.itens) {
        const linha = linhaPorId.get(alteracao.itemOrdemId);
        if (!linha) throw new BadRequestException('Item não pertence a esta ordem');

        const [item] = await tx.select().from(itensContrato).where(eq(itensContrato.id, linha.itemContratoId!)).for('update');
        if (!item) throw new BadRequestException('Item do contrato não encontrado');
        const [usadoRow] = await tx
          .select({ total: sql<string>`coalesce(sum(${itensOrdem.quantidade}), 0)` })
          .from(itensOrdem)
          .innerJoin(ordens, eq(itensOrdem.ordemId, ordens.id))
          .where(and(eq(ordens.contratoId, ordem.contratoId!), eq(ordens.status, 'EMITIDA'), eq(itensOrdem.itemContratoId, item.id), ne(itensOrdem.ordemId, id)));
        const disponivel = Number(item.quantidade) - Number(usadoRow?.total ?? 0);

        if (alteracao.quantidade > disponivel) {
          throw new BadRequestException(`Quantidade solicitada para "${item.descricao}" (${alteracao.quantidade}) excede o saldo disponível (${disponivel})`);
        }

        const precoUnitario = Number(linha.precoUnitario);
        await tx
          .update(itensOrdem)
          .set({ quantidade: String(alteracao.quantidade), precoTotal: (precoUnitario * alteracao.quantidade).toFixed(2) })
          .where(eq(itensOrdem.id, linha.id));
        depois.push({ itensOrdemId: linha.id, quantidade: String(alteracao.quantidade) });
      }

      await tx.insert(ordemHistorico).values({ tenantId, ordemId: id, tipoEvento: 'editou_ordem', usuarioId, dadosSnapshot: { antes, depois } });

      return this.findDetalhada(tx as unknown as DrizzleDB, tenantId, id);
    });
  }

  // Cancela uma ordem (emitida ou em rascunho) e grava o evento no
  // histórico. Não existe decremento a "desfazer" explicitamente: o saldo é
  // sempre derivado filtrando status='EMITIDA', então uma ordem cancelada
  // simplesmente para de contar — o saldo volta sozinho.
  async cancelar(tenantId: string, usuarioId: string, id: string) {
    const ordem = await this.get(tenantId, id);
    if (ordem.status === 'CANCELADA') {
      throw new BadRequestException('Esta ordem já está cancelada');
    }
    await this.db.update(ordens).set({ status: 'CANCELADA' }).where(and(eq(ordens.id, id), eq(ordens.tenantId, tenantId)));
    await this.db.insert(ordemHistorico).values({ tenantId, ordemId: id, tipoEvento: 'cancelou', usuarioId });
    return this.get(tenantId, id);
  }

  async historico(tenantId: string, id: string) {
    await this.get(tenantId, id); // valida que a ordem pertence ao tenant
    const rows = await this.db.query.ordemHistorico.findMany({
      where: and(eq(ordemHistorico.tenantId, tenantId), eq(ordemHistorico.ordemId, id)),
      with: { usuario: true },
      orderBy: (h, { desc }) => [desc(h.criadoEm)],
    });
    // Nunca expor o hash de senha do usuário autor do evento na resposta.
    return rows.map(({ usuario: { senhaHash, ...usuario }, ...rest }) => ({ ...rest, usuario }));
  }
}
