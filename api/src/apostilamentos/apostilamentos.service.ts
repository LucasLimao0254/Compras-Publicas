import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../db/db.module';
import { contratoApostilamentos, contratos } from '../db/schema';
import { CreateApostilamentoDto } from './dto/apostilamento.dto';

// Registro formal (Lei 14.133/2021, art. 136) — ao contrário de Aditivo,
// nunca altera quantidade/valor de item nem tem checagem de saldo/teto.
@Injectable()
export class ApostilamentosService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  private async contratoDoTenant(tenantId: string, contratoId: string) {
    const [c] = await this.db.select({ id: contratos.id }).from(contratos).where(and(eq(contratos.id, contratoId), eq(contratos.tenantId, tenantId)));
    if (!c) throw new NotFoundException('Contrato não encontrado');
  }

  async list(tenantId: string, contratoId: string) {
    await this.contratoDoTenant(tenantId, contratoId);
    return this.db.query.contratoApostilamentos.findMany({
      where: and(eq(contratoApostilamentos.tenantId, tenantId), eq(contratoApostilamentos.contratoId, contratoId)),
      orderBy: (a, { desc }) => [desc(a.criadoEm)],
    });
  }

  async create(tenantId: string, contratoId: string, usuarioId: string, dto: CreateApostilamentoDto) {
    await this.contratoDoTenant(tenantId, contratoId);
    const [row] = await this.db
      .insert(contratoApostilamentos)
      .values({
        tenantId,
        contratoId,
        tipo: dto.tipo as any,
        descricao: dto.descricao,
        valorAnterior: dto.valorAnterior != null ? String(dto.valorAnterior) : null,
        valorNovo: dto.valorNovo != null ? String(dto.valorNovo) : null,
        criadoPor: usuarioId,
      })
      .returning();
    return row;
  }
}
