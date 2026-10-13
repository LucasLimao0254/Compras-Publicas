import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../db/db.module';
import { aditivoItens, aditivos, contratos, itensContrato, itensOrdem, ordens } from '../db/schema';
import { centavos, centavosDoTotal, decimal2, reais } from '../common/dinheiro';
import { ContratosService } from '../contratos/contratos.service';
import { SaldoCeilingService } from '../saldo-ceiling/saldo-ceiling.service';
import { CreateAditivoDto } from './dto/aditivo.dto';

type TipoAditivo = 'VALOR' | 'PRAZO' | 'QUANTIDADE' | 'SUPRESSAO' | 'ACRESCIMO_ESPECIAL';

const brl = (valorEmCentavos: number) => reais(valorEmCentavos).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
// Tipos que aumentam o consumo do contrato — são os únicos sujeitos ao
// pré-check de 3 níveis (ver verificarTetoEsgotado). PRAZO só mexe em
// vigência; SUPRESSAO reduz consumo, então exigir teto esgotado pra permitir
// uma redução seria ao contrário do que a checagem existe pra evitar.
const TIPOS_QUE_AUMENTAM_CONSUMO: TipoAditivo[] = ['VALOR', 'QUANTIDADE', 'ACRESCIMO_ESPECIAL'];

@Injectable()
export class AditivosService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private contratosService: ContratosService,
    private saldoCeiling: SaldoCeilingService,
  ) {}

  private async contratoDoTenant(tenantId: string, contratoId: string) {
    const [c] = await this.db.select().from(contratos).where(and(eq(contratos.id, contratoId), eq(contratos.tenantId, tenantId)));
    if (!c) throw new NotFoundException('Contrato não encontrado');
    return c;
  }

  // Soma o valorAcrescimo já registrado para os tipos informados — usado
  // pelo teto de 25% do art. 125. VALOR e QUANTIDADE compartilham o mesmo
  // acumulado porque os dois são "acréscimo" pra lei (aumentar a quantidade
  // de um item no mesmo preço unitário é, na prática, aumentar o valor do
  // contrato); só SUPRESSAO — por ser redução — tem teto próprio.
  private async somaAcrescimos(tx: DrizzleDB, tenantId: string, contratoId: string, tipos: TipoAditivo[]) {
    const [row] = await tx
      .select({ total: sql<string>`coalesce(sum(${aditivos.valorAcrescimo}), 0)` })
      .from(aditivos)
      .where(and(eq(aditivos.tenantId, tenantId), eq(aditivos.contratoId, contratoId), inArray(aditivos.tipo, tipos)));
    return centavos(row?.total);
  }

  // MODELO.md, invariante 6: aditivo que acrescenta valor ou quantidade só
  // com os saldos zerados — o do próprio contrato SEMPRE (contrato manual
  // inclusive: antes ele pulava a checagem inteira e aceitava aditivo com
  // saldo), e o da ata (se houver) e da homologação quando o contrato vem
  // dessa cadeia. Prazo e supressão não passam por aqui: prorrogar é
  // justamente para consumir o saldo restante, e suprimir só faz sentido
  // sobre saldo ainda não consumido.
  private async verificarTetoEsgotado(tx: DrizzleDB, tenantId: string, contrato: typeof contratos.$inferSelect) {
    // Contrato em "Valor global": o saldo é em R$ (as ordens abatem valor, não
    // quantidade por item).
    if (contrato.formaControleSaldo === 'APENAS_VALOR_TOTAL') {
      const saldoEmReais = await this.contratosService.saldoDisponivel(tx, contrato.id);
      if (centavos(saldoEmReais) > 0) {
        throw new BadRequestException(`Ainda há saldo disponível neste contrato (${brl(centavos(saldoEmReais))}) — esgote-o antes de abrir um aditivo`);
      }
      return;
    }
    // Por quantidade, item a item — ver ContratosService.itensComSaldoRestante
    // para por que não comparar o saldo em R$ aqui.
    const [comSaldo] = await this.contratosService.itensComSaldoRestante(tx, contrato.id);
    if (comSaldo) {
      const saldoEmReais = await this.contratosService.saldoDisponivel(tx, contrato.id);
      throw new BadRequestException(
        `Ainda há saldo disponível neste contrato (${brl(centavos(saldoEmReais))} — o item "${comSaldo.item.descricao}" tem ${comSaldo.disponivel} disponível) — esgote-o antes de abrir um aditivo`,
      );
    }
    if (!contrato.ataOrgaoId && !contrato.homologacaoFornecedorId) return;

    const itens = await tx.select().from(itensContrato).where(eq(itensContrato.contratoId, contrato.id));
    for (const item of itens) {
      if (!item.homologacaoItemId) continue;

      if (contrato.ataOrgaoId) {
        const { disponivel } = await this.saldoCeiling.ataItemSaldoDisponivel(tx, tenantId, contrato.ataOrgaoId, item.homologacaoItemId);
        if (disponivel > 0) {
          throw new BadRequestException(
            `O item "${item.descricao}" ainda tem saldo disponível na ata (${disponivel}) — use isso em vez de um aditivo`,
          );
        }
      }

      const { disponivel: disponivelHomologacao } = await this.saldoCeiling.homologacaoItemSaldoDisponivel(tx, tenantId, item.homologacaoItemId);
      if (disponivelHomologacao > 0) {
        throw new BadRequestException(
          `O item "${item.descricao}" ainda tem saldo disponível no teto homologado do fornecedor (${disponivelHomologacao}) — abra um novo contrato ou amplie a alocação na ata em vez de um aditivo`,
        );
      }
    }
  }

  async list(tenantId: string, contratoId: string) {
    await this.contratoDoTenant(tenantId, contratoId);
    return this.db.query.aditivos.findMany({
      where: and(eq(aditivos.tenantId, tenantId), eq(aditivos.contratoId, contratoId)),
      with: { itens: { with: { itemContrato: true } } },
      orderBy: (a, { desc }) => [desc(a.criadoEm)],
    });
  }

  // Cada tipo de aditivo tem um efeito distinto — ver comentário em
  // schema.ts acima de `aditivos` para o porquê de VALOR/SUPRESSAO ficarem
  // derivados (somados a cada leitura) enquanto PRAZO/QUANTIDADE gravam a
  // mudança direto nas colunas afetadas.
  // Quantidade de um item já consumida por ordens emitidas — piso para a
  // supressão (não dá para suprimir o que já foi entregue/empenhado).
  private async quantidadeUsadaEmOrdens(tx: DrizzleDB, contratoId: string, itemContratoId: string) {
    const [row] = await tx
      .select({ total: sql<string>`coalesce(sum(${itensOrdem.quantidade}), 0)` })
      .from(itensOrdem)
      .innerJoin(ordens, eq(itensOrdem.ordemId, ordens.id))
      .where(and(eq(ordens.contratoId, contratoId), eq(ordens.status, 'EMITIDA'), eq(itensOrdem.itemContratoId, itemContratoId)));
    return Number(row?.total ?? 0);
  }

  private async travarItensDoContrato(tx: DrizzleDB, contratoId: string, linhas: { itemContratoId: string; quantidade: number }[]) {
    const vistos = new Set<string>();
    const resultado: { item: typeof itensContrato.$inferSelect; quantidade: number }[] = [];
    for (const linha of linhas) {
      if (vistos.has(linha.itemContratoId)) throw new BadRequestException('O mesmo item aparece mais de uma vez no aditivo');
      vistos.add(linha.itemContratoId);
      const [item] = await tx.select().from(itensContrato).where(eq(itensContrato.id, linha.itemContratoId)).for('update');
      if (!item || item.contratoId !== contratoId) throw new BadRequestException('Item não pertence a este contrato');
      resultado.push({ item, quantidade: linha.quantidade });
    }
    return resultado;
  }

  // Cada tipo de aditivo tem um efeito distinto — ver comentário em
  // schema.ts acima de `aditivos`. Dinheiro sempre em centavos (duas casas,
  // ver common/dinheiro.ts), inclusive os limites de 25%/50% do art. 125.
  async create(tenantId: string, contratoId: string, dto: CreateAditivoDto) {
    return this.db.transaction(async (tx) => {
      const [contrato] = await tx.select().from(contratos).where(and(eq(contratos.id, contratoId), eq(contratos.tenantId, tenantId))).for('update');
      if (!contrato) throw new NotFoundException('Contrato não encontrado');
      if (contrato.situacao !== 'VIGENTE') {
        throw new BadRequestException(`Este contrato está ${contrato.situacao === 'ARQUIVADO' ? 'arquivado' : 'em minuta'} — aditivos só em contrato vigente`);
      }
      const numeroAditivo = dto.numero.trim();
      const [repetido] = await tx.select({ id: aditivos.id }).from(aditivos).where(and(eq(aditivos.contratoId, contratoId), sql`lower(trim(${aditivos.numero})) = lower(${numeroAditivo})`));
      if (repetido) throw new BadRequestException(`Este contrato já tem um aditivo de número ${numeroAditivo}`);
      const valorOriginal = centavos(contrato.valorOriginal);
      const percentualLimite = dto.tipo === 'ACRESCIMO_ESPECIAL' ? 50 : 25;
      // Arredonda para baixo: o limite nunca pode passar do percentual legal.
      const limite = Math.floor((valorOriginal * percentualLimite) / 100);

      if (TIPOS_QUE_AUMENTAM_CONSUMO.includes(dto.tipo as TipoAditivo)) {
        await this.verificarTetoEsgotado(tx, tenantId, contrato);
      }

      const patchContrato: Record<string, unknown> = {};
      let percentual: number | null = null;
      let valorAcrescimo: number | null = null; // centavos
      let diasProrrogacao: number | null = null;
      let vigenciaFinalAnterior: Date | null = null;
      let vigenciaFinalNova: Date | null = null;
      // delta > 0 acresce (QUANTIDADE), delta < 0 suprime (SUPRESSAO).
      let ajustesDeItem: { item: typeof itensContrato.$inferSelect; delta: number }[] = [];

      const verificarLimite = async (tiposAcumulados: TipoAditivo[], rotulo: string) => {
        const acumulado = (await this.somaAcrescimos(tx, tenantId, contratoId, tiposAcumulados)) + valorAcrescimo!;
        if (acumulado > limite) {
          throw new BadRequestException(
            `${rotulo} excede o limite de ${percentualLimite}% do valor original do contrato (${brl(limite)}). O acumulado ficaria em ${brl(acumulado)}.`,
          );
        }
      };

      const valorGlobal = contrato.formaControleSaldo === 'APENAS_VALOR_TOTAL';
      const rotuloLimite = dto.tipo === 'ACRESCIMO_ESPECIAL' ? 'Acréscimo especial' : 'Acréscimo';
      // VALOR e QUANTIDADE somam contra o mesmo teto de 25% (art. 125, §1º —
      // os dois são acréscimo); ACRESCIMO_ESPECIAL (Art. 65 §1º-B) tem o seu,
      // de 50%; SUPRESSAO, por ser redução, também tem teto próprio.
      const poolDoAcrescimo: TipoAditivo[] = dto.tipo === 'ACRESCIMO_ESPECIAL' ? ['ACRESCIMO_ESPECIAL'] : ['VALOR', 'QUANTIDADE'];

      if (valorGlobal && (dto.tipo === 'VALOR' || dto.tipo === 'ACRESCIMO_ESPECIAL' || (dto.tipo === 'SUPRESSAO' && !dto.itens?.length))) {
        // "Valor global": o aditivo mexe no valor do contrato, por percentual
        // — as ordens abatem R$, então o acréscimo é de fato utilizável.
        if (dto.percentual == null) throw new BadRequestException('Informe o percentual do aditivo');
        percentual = dto.percentual;
        valorAcrescimo = centavos((reais(valorOriginal) * dto.percentual) / 100);
        await verificarLimite(dto.tipo === 'SUPRESSAO' ? ['SUPRESSAO'] : poolDoAcrescimo, dto.tipo === 'SUPRESSAO' ? 'Supressão' : rotuloLimite);
      } else if (dto.tipo === 'VALOR' || dto.tipo === 'ACRESCIMO_ESPECIAL' || dto.tipo === 'QUANTIDADE') {
        // Contrato controlado por item: as ordens são limitadas pela
        // quantidade de cada item, então um acréscimo só em R$ virava saldo que
        // nenhuma ordem conseguia usar. O acréscimo diz quais itens crescem e
        // quanto — o valor sai disso, no preço unitário de cada item.
        if (!dto.itens?.length) {
          throw new BadRequestException('Neste contrato o saldo é controlado por item — informe os itens e as quantidades a acrescer');
        }
        const itens = await this.travarItensDoContrato(tx, contratoId, dto.itens);
        ajustesDeItem = itens.map(({ item, quantidade }) => ({ item, delta: quantidade }));
        valorAcrescimo = itens.reduce((acc, { item, quantidade }) => acc + centavosDoTotal(quantidade, item.valorUnitario), 0);
        if (dto.tipo !== 'QUANTIDADE' && valorOriginal > 0) percentual = Math.round((valorAcrescimo / valorOriginal) * 10000) / 100;
        await verificarLimite(poolDoAcrescimo, dto.tipo === 'QUANTIDADE' ? 'O acréscimo de quantidade, somado aos demais aditivos de valor/quantidade,' : rotuloLimite);
      } else if (dto.tipo === 'SUPRESSAO' && !dto.itens?.length) {
        // Contrato controlado por item: um percentual sobre o valor não
        // reduz nenhuma quantidade, e as ordens continuariam podendo
        // consumir o item inteiro. A supressão precisa dizer o que sai.
        throw new BadRequestException('Informe os itens e as quantidades a suprimir');
      } else if (dto.tipo === 'SUPRESSAO') {
        // Supressão quantitativa: reduz a quantidade dos itens informados (o
        // que as ordens enxergam), nunca abaixo do já consumido em ordens.
        const itens = await this.travarItensDoContrato(tx, contratoId, dto.itens!);
        for (const { item, quantidade } of itens) {
          const usado = await this.quantidadeUsadaEmOrdens(tx, contratoId, item.id);
          const suprimivel = Number(item.quantidade) - usado;
          if (quantidade > suprimivel) {
            throw new BadRequestException(`Item "${item.descricao}": só é possível suprimir até ${suprimivel} (o restante já foi consumido em ordens)`);
          }
          ajustesDeItem.push({ item, delta: -quantidade });
        }
        valorAcrescimo = itens.reduce((acc, { item, quantidade }) => acc + centavosDoTotal(quantidade, item.valorUnitario), 0);
        await verificarLimite(['SUPRESSAO'], 'Supressão');
      } else if (dto.tipo === 'PRAZO') {
        if (!dto.diasProrrogacao) throw new BadRequestException('Informe os dias de prorrogação');
        diasProrrogacao = dto.diasProrrogacao;
        vigenciaFinalAnterior = contrato.vigenciaFinal;
        vigenciaFinalNova = new Date(contrato.vigenciaFinal);
        vigenciaFinalNova.setUTCDate(vigenciaFinalNova.getUTCDate() + dto.diasProrrogacao); // data de calendário: sempre em UTC (ver common/datas.ts)
        patchContrato.vigenciaFinal = vigenciaFinalNova;
      }

      const [aditivo] = await tx
        .insert(aditivos)
        .values({
          tenantId,
          contratoId,
          numero: numeroAditivo,
          tipo: dto.tipo as any,
          dataAssinatura: new Date(dto.dataAssinatura),
          percentual: percentual != null ? String(percentual) : null,
          valorAcrescimo: valorAcrescimo != null ? decimal2(valorAcrescimo) : null,
          diasProrrogacao,
          vigenciaFinalAnterior,
          vigenciaFinalNova,
          fundamentoLegal: dto.fundamentoLegal,
          justificativa: dto.justificativa,
        })
        .returning();

      // aditivoItens.quantidadeAcrescida guarda o delta com sinal (negativo na
      // supressão) — é o registro histórico; a quantidade vigente do item é
      // gravada direto em itensContrato.
      for (const { item, delta } of ajustesDeItem) {
        await tx.update(itensContrato).set({ quantidade: String(Number(item.quantidade) + delta) }).where(eq(itensContrato.id, item.id));
        await tx.insert(aditivoItens).values({ aditivoId: aditivo.id, itemContratoId: item.id, quantidadeAcrescida: String(delta) });
      }

      if (Object.keys(patchContrato).length) {
        await tx.update(contratos).set(patchContrato).where(and(eq(contratos.id, contratoId), eq(contratos.tenantId, tenantId)));
      }

      return aditivo;
    });
  }
}
