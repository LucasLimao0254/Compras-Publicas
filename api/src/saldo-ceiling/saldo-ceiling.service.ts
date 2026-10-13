import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { DrizzleDB } from '../db/db.module';
import { ataItens, contratos, homologacaoItens, itensContrato } from '../db/schema';

// Quanto uma linha de contrato consome do teto da ata/homologação: a
// quantidade atual MENOS o que entrou por aditivo de acréscimo (QUANTIDADE, e
// VALOR/ACRESCIMO_ESPECIAL lançados por item) — pelo invariante 6, o
// acréscimo do aditivo fica FORA do teto. A supressão por item abate primeiro
// dessa parcela de fora do teto: só o que passar dela volta ao teto. Com
// aditivoItens guardando o delta com sinal (+ acréscimo, − supressão):
//   consumo = quantidade − max(0, soma dos deltas)
// Ex.: 100 contratados, +30 por aditivo, −20 suprimidos → 110 no contrato,
// 100 no teto (os 20 saíram dos 30 do aditivo); −40 → 90, 90 no teto.
export const quantidadeConsumidaDoTeto = sql<string>`greatest(${itensContrato.quantidade} - greatest(coalesce((
  select sum(ai.quantidade_acrescida) from aditivo_itens ai
  inner join aditivos a on a.id = ai.aditivo_id
  where ai.item_contrato_id = ${itensContrato.id}
), 0), 0), 0)`;

// Serviço compartilhado de teto/saldo da cadeia Homologação → Ata → Contrato.
// Todo método recebe `tx` explicitamente (nunca usa uma conexão própria) —
// quem chama é responsável por já estar dentro de um db.transaction() com o
// lock certo, mesmo padrão dos helpers privados de OrdensService.
@Injectable()
export class SaldoCeilingService {
  // Saldo restante de um item dentro de um órgão de uma ata — teto é
  // ataItens.quantidadeContratada, consumido é a soma de itensContrato de
  // todos os contratos que abatem desse mesmo ataOrgaoId+homologacaoItemId.
  async ataItemSaldoDisponivel(tx: DrizzleDB, tenantId: string, ataOrgaoId: string, homologacaoItemId: string) {
    const rows = await tx
      .select()
      .from(ataItens)
      .where(and(eq(ataItens.ataOrgaoId, ataOrgaoId), eq(ataItens.homologacaoItemId, homologacaoItemId), eq(ataItens.tenantId, tenantId)))
      .for('update');
    if (rows.length !== 1) {
      throw new BadRequestException('Inconsistência: item de ata não encontrado ou duplicado para este item homologado');
    }
    const ataItem = rows[0];

    const [consumidoRow] = await tx
      .select({ total: sql<string>`coalesce(sum(${quantidadeConsumidaDoTeto}), 0)` })
      .from(itensContrato)
      .innerJoin(contratos, eq(itensContrato.contratoId, contratos.id))
      .where(and(eq(contratos.ataOrgaoId, ataOrgaoId), eq(itensContrato.homologacaoItemId, homologacaoItemId), eq(contratos.tenantId, tenantId)));
    const consumido = Number(consumidoRow?.total ?? 0);

    return { ataItem, disponivel: Number(ataItem.quantidadeContratada) - consumido };
  }

  // Saldo restante do teto raiz da homologação para um item — descontando o
  // que já foi reservado em qualquer ata (mesmo sem nenhum contrato ainda
  // contra ela: AtasService.addItem já garante que essa reserva nunca
  // ultrapassa este teto, então descontar a reserva inteira é correto) e o
  // que já foi consumido por contratos diretos (sem ata) contra o mesmo item.
  async homologacaoItemSaldoDisponivel(tx: DrizzleDB, tenantId: string, homologacaoItemId: string) {
    const rows = await tx
      .select()
      .from(homologacaoItens)
      .where(and(eq(homologacaoItens.id, homologacaoItemId), eq(homologacaoItens.tenantId, tenantId)))
      .for('update');
    if (!rows.length) throw new NotFoundException('Item homologado não encontrado');
    const item = rows[0];
    if (item.quantidade == null) throw new BadRequestException('Item homologado ainda não tem quantidade definida');

    const [reservadoRow] = await tx
      .select({ total: sql<string>`coalesce(sum(${ataItens.quantidadeContratada}), 0)` })
      .from(ataItens)
      .where(and(eq(ataItens.homologacaoItemId, homologacaoItemId), eq(ataItens.tenantId, tenantId)));
    const reservadoEmAtas = Number(reservadoRow?.total ?? 0);

    const [consumidoRow] = await tx
      .select({ total: sql<string>`coalesce(sum(${quantidadeConsumidaDoTeto}), 0)` })
      .from(itensContrato)
      .innerJoin(contratos, eq(itensContrato.contratoId, contratos.id))
      .where(and(
        isNotNull(contratos.homologacaoFornecedorId),
        eq(itensContrato.homologacaoItemId, homologacaoItemId),
        eq(contratos.tenantId, tenantId),
      ));
    const consumidoDireto = Number(consumidoRow?.total ?? 0);

    return { item, disponivel: Number(item.quantidade) - reservadoEmAtas - consumidoDireto };
  }
}
