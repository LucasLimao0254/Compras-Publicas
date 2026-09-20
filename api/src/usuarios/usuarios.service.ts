import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, ne } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { DRIZZLE, DrizzleDB } from '../db/db.module';
import { permissoes, usuarios } from '../db/schema';
import { CreateUsuarioDto, UpdateUsuarioDto } from './dto/usuario.dto';

@Injectable()
export class UsuariosService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  async list(tenantId: string) {
    const rows = await this.db.select().from(usuarios).where(eq(usuarios.tenantId, tenantId));
    return rows.map(({ senhaHash, ...rest }) => rest);
  }

  async get(tenantId: string, id: string) {
    const [user] = await this.db.select().from(usuarios).where(and(eq(usuarios.tenantId, tenantId), eq(usuarios.id, id)));
    if (!user) throw new NotFoundException('Usuário não encontrado');
    const perms = await this.db.select().from(permissoes).where(eq(permissoes.usuarioId, id));
    const { senhaHash, ...rest } = user;
    return { ...rest, permissoes: perms.map((p) => p.recurso) };
  }

  // CPF é a identidade da pessoa entre tenants (ver AuthService.trocarTenant)
  // — sem essa checagem, qualquer admin de tenant poderia criar um usuário
  // com o CPF de outra pessoa em outro tenant e, via troca de tenant, assumir
  // a sessão dela (inclusive virando admin de plataforma se o CPF copiado for
  // o de um). Só um admin de plataforma pode "vincular" um CPF já usado em
  // outro tenant — criar usuários dentro do próprio tenant continua livre.
  private async validarCpfEntreTenants(tenantId: string, cpf: string, callerEhAdminPlataforma: boolean) {
    if (callerEhAdminPlataforma) return;
    const outros = await this.db.select({ id: usuarios.id }).from(usuarios).where(and(eq(usuarios.cpf, cpf), ne(usuarios.tenantId, tenantId)));
    if (outros.length) {
      throw new BadRequestException('Este CPF já está cadastrado em outro município — só um administrador de plataforma pode vincular a mesma pessoa a mais de um tenant');
    }
  }

  async create(tenantId: string, callerEhAdminPlataforma: boolean, dto: CreateUsuarioDto) {
    const existing = await this.db
      .select()
      .from(usuarios)
      .where(and(eq(usuarios.tenantId, tenantId), eq(usuarios.email, dto.email)));
    if (existing.length) throw new ConflictException('Já existe um usuário com este e-mail neste município');

    await this.validarCpfEntreTenants(tenantId, dto.cpf, callerEhAdminPlataforma);

    const senhaHash = await bcrypt.hash(dto.senha, 10);
    const [created] = await this.db
      .insert(usuarios)
      .values({
        tenantId,
        cpf: dto.cpf,
        nome: dto.nome,
        email: dto.email,
        senhaHash,
        telefone: dto.telefone,
        tipoUsuario: dto.tipoUsuario ?? 'PADRAO',
        ativo: dto.ativo ?? true,
      })
      .returning();

    if (dto.permissoes?.length) {
      await this.db.insert(permissoes).values(
        dto.permissoes.map((recurso) => ({ usuarioId: created.id, recurso, permitido: true })),
      );
    }

    return this.get(tenantId, created.id);
  }

  async update(tenantId: string, id: string, dto: UpdateUsuarioDto) {
    await this.get(tenantId, id); // garante que existe e pertence ao tenant

    const patch: Record<string, unknown> = {};
    if (dto.nome !== undefined) patch.nome = dto.nome;
    if (dto.telefone !== undefined) patch.telefone = dto.telefone;
    if (dto.ativo !== undefined) patch.ativo = dto.ativo;
    if (dto.tipoUsuario !== undefined) patch.tipoUsuario = dto.tipoUsuario;
    if (dto.senha) patch.senhaHash = await bcrypt.hash(dto.senha, 10);

    if (Object.keys(patch).length) {
      await this.db.update(usuarios).set(patch).where(and(eq(usuarios.id, id), eq(usuarios.tenantId, tenantId)));
    }

    if (dto.permissoes) {
      await this.db.delete(permissoes).where(eq(permissoes.usuarioId, id));
      if (dto.permissoes.length) {
        await this.db.insert(permissoes).values(
          dto.permissoes.map((recurso) => ({ usuarioId: id, recurso, permitido: true })),
        );
      }
    }

    return this.get(tenantId, id);
  }

  async remove(tenantId: string, id: string) {
    await this.get(tenantId, id);
    await this.db.delete(usuarios).where(and(eq(usuarios.id, id), eq(usuarios.tenantId, tenantId)));
    return { ok: true };
  }
}
