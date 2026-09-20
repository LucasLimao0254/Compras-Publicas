import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq, ne } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { DRIZZLE, DrizzleDB } from '../db/db.module';
import { permissoes, tenants, usuarios } from '../db/schema';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private jwt: JwtService,
  ) {}

  // Único lugar que monta o payload/resposta de sessão — usado tanto pelo
  // login com senha quanto pela troca de tenant (que não pede senha de novo,
  // já que a pessoa já provou identidade uma vez nesta sessão).
  private async emitirSessao(user: typeof usuarios.$inferSelect, tenant: typeof tenants.$inferSelect) {
    const perms = await this.db
      .select({ recurso: permissoes.recurso })
      .from(permissoes)
      .where(and(eq(permissoes.usuarioId, user.id), eq(permissoes.permitido, true)));

    const payload = {
      sub: user.id,
      tenantId: tenant.id,
      tipoUsuario: user.tipoUsuario,
      permissoes: perms.map((p) => p.recurso),
      ehAdminPlataforma: user.ehAdminPlataforma,
    };

    return {
      accessToken: await this.jwt.signAsync(payload),
      usuario: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        tipoUsuario: user.tipoUsuario,
        permissoes: payload.permissoes,
        ehAdminPlataforma: user.ehAdminPlataforma,
      },
      tenant: { id: tenant.id, codigo: tenant.codigo, nome: tenant.nome, tipo: tenant.tipo },
    };
  }

  async login(dto: LoginDto) {
    const [tenant] = await this.db.select().from(tenants).where(eq(tenants.codigo, dto.tenantCodigo));
    if (!tenant) throw new UnauthorizedException('Município não encontrado');

    const [user] = await this.db
      .select()
      .from(usuarios)
      .where(and(eq(usuarios.tenantId, tenant.id), eq(usuarios.email, dto.email)));
    if (!user || !user.ativo) throw new UnauthorizedException('Credenciais inválidas');

    const senhaOk = await bcrypt.compare(dto.senha, user.senhaHash);
    if (!senhaOk) throw new UnauthorizedException('Credenciais inválidas');

    return this.emitirSessao(user, tenant);
  }

  // Outros tenants a que a mesma pessoa (mesmo CPF) tem acesso — ver
  // comentário em schema.ts acima de `usuarios` sobre CPF como identidade da
  // pessoa física entre tenants neste MVP.
  async tenantsDisponiveis(usuarioAtualId: string) {
    const [atual] = await this.db.select({ cpf: usuarios.cpf }).from(usuarios).where(eq(usuarios.id, usuarioAtualId));
    if (!atual) throw new UnauthorizedException();

    const rows = await this.db
      .select({
        usuarioId: usuarios.id,
        tenantId: tenants.id,
        tenantNome: tenants.nome,
        tenantCodigo: tenants.codigo,
        tenantTipo: tenants.tipo,
      })
      .from(usuarios)
      .innerJoin(tenants, eq(usuarios.tenantId, tenants.id))
      .where(and(eq(usuarios.cpf, atual.cpf), eq(usuarios.ativo, true), ne(usuarios.id, usuarioAtualId)));
    return rows;
  }

  // Emite uma nova sessão para outro tenant da mesma pessoa, sem pedir senha
  // de novo. Ponto de segurança central: nunca confiar no usuarioId sozinho
  // — sempre confirmar que o CPF do alvo bate com o do usuário já
  // autenticado, senão isto vira um jeito de logar como qualquer um (IDOR).
  async trocarTenant(usuarioAtualId: string, usuarioAlvoId: string) {
    if (usuarioAlvoId === usuarioAtualId) {
      throw new BadRequestException('Você já está autenticado neste usuário');
    }

    const [atual] = await this.db.select().from(usuarios).where(eq(usuarios.id, usuarioAtualId));
    if (!atual || !atual.ativo) throw new UnauthorizedException();

    const [alvo] = await this.db.select().from(usuarios).where(eq(usuarios.id, usuarioAlvoId));
    if (!alvo || !alvo.ativo || alvo.cpf !== atual.cpf) {
      throw new BadRequestException('Não é possível trocar para este usuário/tenant');
    }

    const [tenant] = await this.db.select().from(tenants).where(eq(tenants.id, alvo.tenantId));
    if (!tenant) throw new UnauthorizedException();

    return this.emitirSessao(alvo, tenant);
  }
}
