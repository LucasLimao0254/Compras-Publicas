import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../db/db.module';
import { fornecedores, licitacoes } from '../db/schema';
import { AtasService } from '../atas/atas.service';
import { ContratosService } from '../contratos/contratos.service';
import { FornecedorDto } from './dto/fornecedor.dto';
import { normalizarDocumento, somenteDigitos } from '../common/documentos';

@Injectable()
export class FornecedoresService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private atasService: AtasService,
    private contratosService: ContratosService,
  ) {}

  list(tenantId: string) {
    return this.db.select().from(fornecedores).where(eq(fornecedores.tenantId, tenantId));
  }

  async get(tenantId: string, id: string) {
    const [row] = await this.db.select().from(fornecedores).where(and(eq(fornecedores.tenantId, tenantId), eq(fornecedores.id, id)));
    if (!row) throw new NotFoundException('Fornecedor não encontrado');
    return row;
  }

  // Mesmo documento com ou sem máscara é o mesmo fornecedor — a comparação é
  // pelos dígitos, para pegar também registros antigos gravados sem máscara.
  private async existeComDocumento(tenantId: string, cnpjCpf: string, ignorarId?: string) {
    const condicoes = [eq(fornecedores.tenantId, tenantId), sql`regexp_replace(${fornecedores.cnpjCpf}, '[^0-9]', '', 'g') = ${somenteDigitos(cnpjCpf)}`];
    if (ignorarId) condicoes.push(ne(fornecedores.id, ignorarId));
    const [dup] = await this.db.select({ id: fornecedores.id }).from(fornecedores).where(and(...condicoes));
    return !!dup;
  }

  async create(tenantId: string, dto: FornecedorDto) {
    const cnpjCpf = normalizarDocumento(dto.cnpjCpf);
    if (await this.existeComDocumento(tenantId, cnpjCpf)) throw new ConflictException('Já existe um fornecedor com este CNPJ/CPF');
    const [row] = await this.db.insert(fornecedores).values({ tenantId, cnpjCpf, razaoSocial: dto.razaoSocial }).returning();
    return row;
  }

  async update(tenantId: string, id: string, dto: FornecedorDto) {
    await this.get(tenantId, id);
    const cnpjCpf = normalizarDocumento(dto.cnpjCpf);
    if (await this.existeComDocumento(tenantId, cnpjCpf, id)) throw new ConflictException('Já existe um fornecedor com este CNPJ/CPF');
    const [row] = await this.db.update(fornecedores).set({ cnpjCpf, razaoSocial: dto.razaoSocial }).where(and(eq(fornecedores.id, id), eq(fornecedores.tenantId, tenantId))).returning();
    return row;
  }

  async remove(tenantId: string, id: string) {
    await this.get(tenantId, id);
    await this.db.delete(fornecedores).where(and(eq(fornecedores.id, id), eq(fornecedores.tenantId, tenantId)));
    return { ok: true };
  }

  // Navegação cruzada: licitações em que este fornecedor participou, com as
  // atas/contratos derivados de cada uma e o saldo atual — reusa
  // AtasService.list/ContratosService.list (mesmo cálculo de saldo das telas
  // de detalhe), não duplica a lógica.
  async processos(tenantId: string, fornecedorId: string) {
    await this.get(tenantId, fornecedorId);

    const [todasAtas, todosContratos] = await Promise.all([this.atasService.list(tenantId), this.contratosService.list(tenantId)]);
    const atasDoFornecedor = todasAtas.filter((a) => a.detentorPrincipalId === fornecedorId);
    const contratosDoFornecedor = todosContratos.filter((c) => c.fornecedorId === fornecedorId);

    const licitacaoIds = [...new Set([...atasDoFornecedor.map((a) => a.licitacaoId), ...contratosDoFornecedor.map((c) => c.licitacaoId)])];
    const licitacoesDoFornecedor = licitacaoIds.length
      ? await this.db.select().from(licitacoes).where(and(eq(licitacoes.tenantId, tenantId), inArray(licitacoes.id, licitacaoIds)))
      : [];

    return licitacoesDoFornecedor.map((lic) => ({
      licitacao: lic,
      atas: atasDoFornecedor.filter((a) => a.licitacaoId === lic.id),
      contratos: contratosDoFornecedor.filter((c) => c.licitacaoId === lic.id),
    }));
  }
}
