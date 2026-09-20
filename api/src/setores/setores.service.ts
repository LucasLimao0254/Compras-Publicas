import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../db/db.module';
import { modulos, setores, tenantSetores } from '../db/schema';

@Injectable()
export class SetoresService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  // Módulos do setor de um tenant, só os cujo setor está habilitado pra ele —
  // setor sem linha em tenantSetores conta como não habilitado (padrão
  // restritivo). É a fonte única que substitui os arrays hoje hardcoded e
  // duplicados (MENU em Layout.tsx, RECURSOS em Usuarios.tsx).
  async modulosDoTenant(tenantId: string) {
    return this.db
      .select({ id: modulos.id, recurso: modulos.recurso, nome: modulos.nome, icone: modulos.icone, setorNome: setores.nome })
      .from(modulos)
      .innerJoin(setores, eq(modulos.setorId, setores.id))
      .innerJoin(tenantSetores, and(eq(tenantSetores.setorId, setores.id), eq(tenantSetores.tenantId, tenantId)))
      .where(eq(tenantSetores.habilitado, true));
  }
}
