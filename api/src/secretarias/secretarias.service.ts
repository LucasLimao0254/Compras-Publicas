import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../db/db.module';
import { secretarias } from '../db/schema';
import { SecretariaDto } from './dto/secretaria.dto';

@Injectable()
export class SecretariasService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  list(tenantId: string) {
    return this.db.select().from(secretarias).where(eq(secretarias.tenantId, tenantId));
  }

  async get(tenantId: string, id: string) {
    const [row] = await this.db.select().from(secretarias).where(and(eq(secretarias.tenantId, tenantId), eq(secretarias.id, id)));
    if (!row) throw new NotFoundException('Secretaria não encontrada');
    return row;
  }

  async create(tenantId: string, dto: SecretariaDto) {
    const [row] = await this.db.insert(secretarias).values({ tenantId, ...dto }).returning();
    return row;
  }

  async update(tenantId: string, id: string, dto: SecretariaDto) {
    await this.get(tenantId, id);
    const [row] = await this.db.update(secretarias).set(dto).where(and(eq(secretarias.id, id), eq(secretarias.tenantId, tenantId))).returning();
    return row;
  }

  async remove(tenantId: string, id: string) {
    await this.get(tenantId, id);
    await this.db.delete(secretarias).where(and(eq(secretarias.id, id), eq(secretarias.tenantId, tenantId)));
    return { ok: true };
  }
}
