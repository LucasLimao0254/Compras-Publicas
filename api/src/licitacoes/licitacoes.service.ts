import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../db/db.module';
import { licitacoes } from '../db/schema';
import { LicitacaoDto } from './dto/licitacao.dto';

@Injectable()
export class LicitacoesService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  list(tenantId: string) {
    return this.db.select().from(licitacoes).where(eq(licitacoes.tenantId, tenantId));
  }

  async get(tenantId: string, id: string) {
    const [row] = await this.db.select().from(licitacoes).where(and(eq(licitacoes.tenantId, tenantId), eq(licitacoes.id, id)));
    if (!row) throw new NotFoundException('Licitação não encontrada');
    return row;
  }

  async create(tenantId: string, dto: LicitacaoDto) {
    const dup = await this.db.select().from(licitacoes).where(and(eq(licitacoes.tenantId, tenantId), eq(licitacoes.numero, dto.numero)));
    if (dup.length) throw new ConflictException('Já existe uma licitação com este número');
    const [row] = await this.db.insert(licitacoes).values({ tenantId, ...dto } as any).returning();
    return row;
  }

  async update(tenantId: string, id: string, dto: LicitacaoDto) {
    await this.get(tenantId, id);
    const [row] = await this.db.update(licitacoes).set(dto as any).where(eq(licitacoes.id, id)).returning();
    return row;
  }

  async remove(tenantId: string, id: string) {
    await this.get(tenantId, id);
    await this.db.delete(licitacoes).where(eq(licitacoes.id, id));
    return { ok: true };
  }
}
