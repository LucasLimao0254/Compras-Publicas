import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../db/db.module';
import { licitacoes } from '../db/schema';
import { AtasService } from '../atas/atas.service';
import { ContratosService } from '../contratos/contratos.service';
import { LicitacaoDto } from './dto/licitacao.dto';

@Injectable()
export class LicitacoesService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private atasService: AtasService,
    private contratosService: ContratosService,
  ) {}

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
    const [row] = await this.db.update(licitacoes).set(dto as any).where(and(eq(licitacoes.id, id), eq(licitacoes.tenantId, tenantId))).returning();
    return row;
  }

  async remove(tenantId: string, id: string) {
    await this.get(tenantId, id);
    await this.db.delete(licitacoes).where(and(eq(licitacoes.id, id), eq(licitacoes.tenantId, tenantId)));
    return { ok: true };
  }

  // Navegação cruzada: atas e contratos nascidos desta licitação — reusa
  // AtasService.list/ContratosService.list, não duplica cálculo de saldo.
  async derivados(tenantId: string, licitacaoId: string) {
    await this.get(tenantId, licitacaoId);
    const [todasAtas, todosContratos] = await Promise.all([this.atasService.list(tenantId), this.contratosService.list(tenantId)]);
    return {
      atas: todasAtas.filter((a) => a.licitacaoId === licitacaoId),
      contratos: todosContratos.filter((c) => c.licitacaoId === licitacaoId),
    };
  }
}
