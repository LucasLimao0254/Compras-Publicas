import { BadRequestException, HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq, ne, sql } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { DRIZZLE, DrizzleDB } from '../db/db.module';
import { permissoes, tenants, usuarios } from '../db/schema';
import { LoginDto } from './dto/login.dto';

// Tentativas de senha errada por município+e-mail: depois de 5 em 15 minutos,
// o login fica bloqueado até a janela passar (contra tentativa e erro). Em
// memória — reinicia junto com o servidor, o que basta para um serviço só.
const MAX_TENTATIVAS = 5;
const JANELA_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  private falhas = new Map<string, { quantas: number; desde: number }>();
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

  async me(usuarioId: string, permissoesAtuais: string[]) {
    const [user] = await this.db.select().from(usuarios).where(eq(usuarios.id, usuarioId));
    if (!user) throw new UnauthorizedException();
    return { id: user.id, nome: user.nome, email: user.email, tipoUsuario: user.tipoUsuario, permissoes: permissoesAtuais, ehAdminPlataforma: user.ehAdminPlataforma };
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const chave = `${dto.tenantCodigo}:${email}`;
    const registro = this.falhas.get(chave);
    if (registro && Date.now() - registro.desde < JANELA_MS && registro.quantas >= MAX_TENTATIVAS) {
      const minutos = Math.ceil((JANELA_MS - (Date.now() - registro.desde)) / 60000);
      throw new HttpException(`Muitas tentativas de acesso — aguarde ${minutos} minuto(s) e tente de novo`, HttpStatus.TOO_MANY_REQUESTS);
    }
    const falhou = () => {
      const atual = this.falhas.get(chave);
      if (!atual || Date.now() - atual.desde >= JANELA_MS) this.falhas.set(chave, { quantas: 1, desde: Date.now() });
      else atual.quantas++;
      return new UnauthorizedException('Credenciais inválidas');
    };

    const [tenant] = await this.db.select().from(tenants).where(eq(tenants.codigo, dto.tenantCodigo));
    if (!tenant) throw new UnauthorizedException('Município não encontrado');

    // E-mail sem diferenciar maiúsculas ("Admin@..." = "admin@...").
    const [user] = await this.db
      .select()
      .from(usuarios)
      .where(and(eq(usuarios.tenantId, tenant.id), sql`lower(${usuarios.email}) = ${email}`));
    if (!user || !user.ativo) throw falhou();

    const senhaOk = await bcrypt.compare(dto.senha, user.senhaHash);
    if (!senhaOk) throw falhou();

    this.falhas.delete(chave);
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
