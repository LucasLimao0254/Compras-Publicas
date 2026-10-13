import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../db/db.module';
import { fornecedores, licitacoes } from '../db/schema';
import { AtasService } from '../atas/atas.service';
import { ContratosService } from '../contratos/contratos.service';
import { FornecedorDto } from './dto/fornecedor.dto';
import { documentoFornecedor, soDigitos } from '../common/documentos';

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

  // CNPJ/CPF validado e gravado num formato só; a duplicidade é conferida
  // pelos dígitos, para pegar também cadastros antigos gravados sem máscara.
  async create(tenantId: string, dto: FornecedorDto) {
    const cnpjCpf = this.documento(dto.cnpjCpf);
    await this.recusarDuplicado(tenantId, cnpjCpf);
    const [row] = await this.db.insert(fornecedores).values({ tenantId, cnpjCpf, razaoSocial: dto.razaoSocial.trim() }).returning();
    return row;
  }

  async update(tenantId: string, id: string, dto: FornecedorDto) {
    const atual = await this.get(tenantId, id);
    // Cadastro antigo com documento inválido continua editável na razão social;
    // o documento só é validado quando muda.
    const mudouDocumento = soDigitos(dto.cnpjCpf) !== soDigitos(atual.cnpjCpf);
    const cnpjCpf = mudouDocumento ? this.documento(dto.cnpjCpf) : atual.cnpjCpf;
    if (mudouDocumento) await this.recusarDuplicado(tenantId, cnpjCpf, id);
    const [row] = await this.db.update(fornecedores).set({ cnpjCpf, razaoSocial: dto.razaoSocial.trim() }).where(and(eq(fornecedores.id, id), eq(fornecedores.tenantId, tenantId))).returning();
    return row;
  }

  private documento(valor: string) {
    const doc = documentoFornecedor(valor);
    if (!doc) throw new BadRequestException('CNPJ/CPF inválido — confira os dígitos');
    return doc;
  }

  private async recusarDuplicado(tenantId: string, cnpjCpf: string, excetoId?: string) {
    const todos = await this.db.select({ id: fornecedores.id, cnpjCpf: fornecedores.cnpjCpf, razaoSocial: fornecedores.razaoSocial }).from(fornecedores).where(eq(fornecedores.tenantId, tenantId));
    const dup = todos.find((f) => f.id !== excetoId && soDigitos(f.cnpjCpf) === soDigitos(cnpjCpf));
    if (dup) throw new ConflictException(`Já existe um fornecedor com este CNPJ/CPF: ${dup.razaoSocial}`);
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
