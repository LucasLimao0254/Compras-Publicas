import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../db/db.module';
import { dotacoes } from '../db/schema';
import { DotacaoDto } from './dto/dotacao.dto';

@Injectable()
export class DotacoesService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  list(tenantId: string) {
    return this.db.select().from(dotacoes).where(eq(dotacoes.tenantId, tenantId));
  }

  async get(tenantId: string, id: string) {
    const [row] = await this.db.select().from(dotacoes).where(and(eq(dotacoes.tenantId, tenantId), eq(dotacoes.id, id)));
    if (!row) throw new NotFoundException('Dotação não encontrada');
    return row;
  }

  async create(tenantId: string, dto: DotacaoDto) {
    const [row] = await this.db.insert(dotacoes).values({ tenantId, ...dto }).returning();
    return row;
  }
}
