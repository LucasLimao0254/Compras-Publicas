import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../db/db.module';
import { setores, tenantSetores, tenants } from '../db/schema';

@Injectable()
export class PlataformaService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  async tenants() {
    const [todosTenants, todosSetores, todosVinculos] = await Promise.all([
      this.db.select().from(tenants),
      this.db.select().from(setores),
      this.db.select().from(tenantSetores),
    ]);
    const vinculoPorPar = new Map(todosVinculos.map((v) => [`${v.tenantId}:${v.setorId}`, v.habilitado]));

    return todosTenants.map((t) => ({
      ...t,
      setores: todosSetores.map((s) => ({
        id: s.id,
        chave: s.chave,
        nome: s.nome,
        descricao: s.descricao,
        disponivel: s.disponivel,
        habilitado: vinculoPorPar.get(`${t.id}:${s.id}`) ?? false,
      })),
    }));
  }

  async alternarSetor(tenantId: string, setorId: string, habilitado: boolean) {
    const [tenant] = await this.db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId));
    if (!tenant) throw new NotFoundException('Tenant não encontrado');

    const [setor] = await this.db.select().from(setores).where(eq(setores.id, setorId));
    if (!setor) throw new NotFoundException('Setor não encontrado');
    if (!setor.disponivel) throw new BadRequestException('Este setor ainda não está disponível para habilitar ("Em breve")');

    const [existente] = await this.db
      .select({ id: tenantSetores.id })
      .from(tenantSetores)
      .where(and(eq(tenantSetores.tenantId, tenantId), eq(tenantSetores.setorId, setorId)));

    if (existente) {
      await this.db.update(tenantSetores).set({ habilitado }).where(eq(tenantSetores.id, existente.id));
    } else {
      await this.db.insert(tenantSetores).values({ tenantId, setorId, habilitado });
    }

    return { ok: true };
  }
}
