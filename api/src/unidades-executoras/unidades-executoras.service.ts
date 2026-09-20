import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../db/db.module';
import { unidadesExecutoras } from '../db/schema';
import { UnidadeExecutoraDto } from './dto/unidade-executora.dto';

@Injectable()
export class UnidadesExecutorasService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  list(tenantId: string) {
    return this.db.select().from(unidadesExecutoras).where(eq(unidadesExecutoras.tenantId, tenantId));
  }

  async get(tenantId: string, id: string) {
    const [row] = await this.db.select().from(unidadesExecutoras).where(and(eq(unidadesExecutoras.tenantId, tenantId), eq(unidadesExecutoras.id, id)));
    if (!row) throw new NotFoundException('Unidade executora não encontrada');
    return row;
  }

  async create(tenantId: string, dto: UnidadeExecutoraDto) {
    const [row] = await this.db.insert(unidadesExecutoras).values({ tenantId, ...dto }).returning();
    return row;
  }

  async update(tenantId: string, id: string, dto: UnidadeExecutoraDto) {
    await this.get(tenantId, id);
    const [row] = await this.db.update(unidadesExecutoras).set(dto).where(and(eq(unidadesExecutoras.id, id), eq(unidadesExecutoras.tenantId, tenantId))).returning();
    return row;
  }

  async remove(tenantId: string, id: string) {
    await this.get(tenantId, id);
    await this.db.delete(unidadesExecutoras).where(and(eq(unidadesExecutoras.id, id), eq(unidadesExecutoras.tenantId, tenantId)));
    return { ok: true };
  }
}
