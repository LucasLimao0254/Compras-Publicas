import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../db/db.module';
import { aditivoItens, aditivos, contratos, itensContrato } from '../db/schema';
import { ContratosService } from '../contratos/contratos.service';
import { SaldoCeilingService } from '../saldo-ceiling/saldo-ceiling.service';
import { CreateAditivoDto } from './dto/aditivo.dto';

type TipoAditivo = 'VALOR' | 'PRAZO' | 'QUANTIDADE' | 'SUPRESSAO' | 'ACRESCIMO_ESPECIAL';
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
    return Number(row?.total ?? 0);
  }

  // Pré-requisito adicional, só para contratos vindos de ata/homologação:
  // antes de aumentar consumo via aditivo, exige que o saldo do próprio
  // contrato, o da ata (se houver) e o da homologação já estejam esgotados —
  // caso contrário a resposta certa é abrir um novo contrato ou ampliar a
  // alocação na ata, não um aditivo que desvincula o valor do contrato do
  // teto que o resto do sistema enxerga (ver plano/briefing do usuário).
  // Contratos manuais/legados (sem ataOrgaoId nem homologacaoFornecedorId)
  // não passam por esta checagem — comportamento inalterado para eles.
  private async verificarTetoEsgotado(tx: DrizzleDB, tenantId: string, contrato: typeof contratos.$inferSelect) {
    if (!contrato.ataOrgaoId && !contrato.homologacaoFornecedorId) return;

    const saldoContrato = await this.contratosService.saldoDisponivel(tx, contrato.id);
    if (saldoContrato > 0) {
      throw new BadRequestException(
        `Ainda há saldo disponível neste contrato (R$ ${saldoContrato.toFixed(2)}) — esgote-o antes de abrir um aditivo`,
      );
    }

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
  async create(tenantId: string, contratoId: string, dto: CreateAditivoDto) {
    return this.db.transaction(async (tx) => {
      const [contrato] = await tx.select().from(contratos).where(and(eq(contratos.id, contratoId), eq(contratos.tenantId, tenantId))).for('update');
      if (!contrato) throw new NotFoundException('Contrato não encontrado');
      const valorOriginal = Number(contrato.valorOriginal);
      const limite = valorOriginal * (dto.tipo === 'ACRESCIMO_ESPECIAL' ? 0.5 : 0.25);

      if (TIPOS_QUE_AUMENTAM_CONSUMO.includes(dto.tipo as TipoAditivo)) {
        await this.verificarTetoEsgotado(tx, tenantId, contrato);
      }

      const patchContrato: Record<string, unknown> = {};
      let percentual: number | null = null;
      let valorAcrescimo: number | null = null;
      let diasProrrogacao: number | null = null;
      let vigenciaFinalAnterior: Date | null = null;
      let vigenciaFinalNova: Date | null = null;
      let itensParaAcrescer: { item: typeof itensContrato.$inferSelect; quantidade: number }[] = [];

      if (dto.tipo === 'VALOR' || dto.tipo === 'SUPRESSAO' || dto.tipo === 'ACRESCIMO_ESPECIAL') {
        if (dto.percentual == null) throw new BadRequestException('Informe o percentual do aditivo');
        percentual = dto.percentual;
        valorAcrescimo = (valorOriginal * dto.percentual) / 100;

        // Art. 125, §1º da Lei 14.133/2021: VALOR e QUANTIDADE somam contra o
        // mesmo teto de 25% (os dois são "acréscimo" pra lei); SUPRESSAO, por
        // ser redução, tem teto próprio; ACRESCIMO_ESPECIAL (Art. 65 §1º-B —
        // reforma de edifício/equipamento) tem seu próprio teto de 50%,
        // totalmente separado dos outros dois — ver somaAcrescimos().
        const tiposAcumulados: TipoAditivo[] = dto.tipo === 'VALOR' ? ['VALOR', 'QUANTIDADE'] : [dto.tipo as TipoAditivo];
        const acumulado = (await this.somaAcrescimos(tx, tenantId, contratoId, tiposAcumulados)) + valorAcrescimo;
        if (acumulado > limite) {
          const rotulo = dto.tipo === 'VALOR' ? 'Acréscimo' : dto.tipo === 'SUPRESSAO' ? 'Supressão' : 'Acréscimo especial';
          throw new BadRequestException(
            `${rotulo} excede o limite de ${(limite / valorOriginal * 100).toFixed(0)}% do valor original do contrato (R$ ${limite.toFixed(2)}). O acumulado ficaria em R$ ${acumulado.toFixed(2)}.`,
          );
        }
      } else if (dto.tipo === 'PRAZO') {
        if (!dto.diasProrrogacao) throw new BadRequestException('Informe os dias de prorrogação');
        diasProrrogacao = dto.diasProrrogacao;
        vigenciaFinalAnterior = contrato.vigenciaFinal;
        vigenciaFinalNova = new Date(contrato.vigenciaFinal);
        vigenciaFinalNova.setDate(vigenciaFinalNova.getDate() + dto.diasProrrogacao);
        patchContrato.vigenciaFinal = vigenciaFinalNova;
      } else if (dto.tipo === 'QUANTIDADE') {
        if (!dto.itens?.length) throw new BadRequestException('Informe ao menos um item para acrescer quantidade');
        for (const linha of dto.itens) {
          const [item] = await tx.select().from(itensContrato).where(eq(itensContrato.id, linha.itemContratoId)).for('update');
          if (!item || item.contratoId !== contratoId) throw new BadRequestException('Item não pertence a este contrato');
          itensParaAcrescer.push({ item, quantidade: linha.quantidade });
        }
        // Aumentar quantidade no mesmo preço unitário aumenta o valor do
        // contrato na mesma proporção — precisa do mesmo teto de 25% que um
        // aditivo de VALOR, senão dá pra contornar o limite legal só trocando
        // o tipo do aditivo.
        valorAcrescimo = itensParaAcrescer.reduce((acc, { item, quantidade }) => acc + quantidade * Number(item.valorUnitario), 0);
        const acumulado = (await this.somaAcrescimos(tx, tenantId, contratoId, ['VALOR', 'QUANTIDADE'])) + valorAcrescimo;
        if (acumulado > limite) {
          throw new BadRequestException(
            `O acréscimo de quantidade equivale a R$ ${valorAcrescimo.toFixed(2)} e excede, somado aos demais aditivos de valor/quantidade, o limite de 25% do valor original do contrato (R$ ${limite.toFixed(2)}). O acumulado ficaria em R$ ${acumulado.toFixed(2)}.`,
          );
        }
      }

      const [aditivo] = await tx
        .insert(aditivos)
        .values({
          tenantId,
          contratoId,
          numero: dto.numero,
          tipo: dto.tipo as any,
          dataAssinatura: new Date(dto.dataAssinatura),
          percentual: percentual != null ? String(percentual) : null,
          valorAcrescimo: valorAcrescimo != null ? valorAcrescimo.toFixed(2) : null,
          diasProrrogacao,
          vigenciaFinalAnterior,
          vigenciaFinalNova,
          fundamentoLegal: dto.fundamentoLegal,
          justificativa: dto.justificativa,
        })
        .returning();

      for (const { item, quantidade } of itensParaAcrescer) {
        await tx.update(itensContrato).set({ quantidade: String(Number(item.quantidade) + quantidade) }).where(eq(itensContrato.id, item.id));
        await tx.insert(aditivoItens).values({ aditivoId: aditivo.id, itemContratoId: item.id, quantidadeAcrescida: String(quantidade) });
      }

      if (Object.keys(patchContrato).length) {
        await tx.update(contratos).set(patchContrato).where(and(eq(contratos.id, contratoId), eq(contratos.tenantId, tenantId)));
      }

      return aditivo;
    });
  }
}
