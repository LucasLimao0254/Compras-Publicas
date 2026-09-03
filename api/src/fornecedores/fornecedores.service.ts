import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../db/db.module';
import { fornecedores } from '../db/schema';
import { FornecedorDto } from './dto/fornecedor.dto';

@Injectable()
export class FornecedoresService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  list(tenantId: string) {
    return this.db.select().from(fornecedores).where(eq(fornecedores.tenantId, tenantId));
  }

  async get(tenantId: string, id: string) {
    const [row] = await this.db.select().from(fornecedores).where(and(eq(fornecedores.tenantId, tenantId), eq(fornecedores.id, id)));
    if (!row) throw new NotFoundException('Fornecedor não encontrado');
    return row;
  }

  async create(tenantId: string, dto: FornecedorDto) {
    const dup = await this.db.select().from(fornecedores).where(and(eq(fornecedores.tenantId, tenantId), eq(fornecedores.cnpjCpf, dto.cnpjCpf)));
    if (dup.length) throw new ConflictException('Já existe um fornecedor com este CNPJ/CPF');
    const [row] = await this.db.insert(fornecedores).values({ tenantId, ...dto }).returning();
    return row;
  }

  async update(tenantId: string, id: string, dto: FornecedorDto) {
    await this.get(tenantId, id);
    const [row] = await this.db.update(fornecedores).set(dto).where(eq(fornecedores.id, id)).returning();
    return row;
  }

  async remove(tenantId: string, id: string) {
    await this.get(tenantId, id);
    await this.db.delete(fornecedores).where(eq(fornecedores.id, id));
    return { ok: true };
  }
}
