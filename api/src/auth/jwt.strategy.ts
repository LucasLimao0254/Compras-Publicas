import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../db/db.module';
import { permissoes, usuarios } from '../db/schema';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: string; // usuarioId
  tenantId: string;
  tipoUsuario: 'ADMIN' | 'PADRAO';
  permissoes: string[];
  ehAdminPlataforma: boolean;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, @Inject(DRIZZLE) private db: DrizzleDB) {
    const secret = config.get<string>('JWT_SECRET');
    // Sem fallback hardcoded de propósito: um valor padrão conhecido no
    // código-fonte permitiria forjar um token válido (qualquer tenant, ADMIN,
    // qualquer permissão) para quem ler o repositório. Falhar no boot é
    // preferível a subir com um segredo público.
    if (!secret) throw new Error('JWT_SECRET não configurado — defina essa variável de ambiente antes de iniciar a API');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  // O token prova quem é a pessoa; o que ela pode fazer vem do banco a cada
  // requisição. Antes o tipo e as permissões ficavam congelados no token por
  // 8 horas: usuário desativado, rebaixado ou com permissão retirada seguia
  // com acesso até o token expirar. Duas consultas pequenas por requisição.
  async validate(payload: JwtPayload) {
    const [user] = await this.db
      .select({ id: usuarios.id, tenantId: usuarios.tenantId, ativo: usuarios.ativo, tipoUsuario: usuarios.tipoUsuario, ehAdminPlataforma: usuarios.ehAdminPlataforma })
      .from(usuarios)
      .where(eq(usuarios.id, payload.sub));
    if (!user || !user.ativo || user.tenantId !== payload.tenantId) {
      throw new UnauthorizedException('Sessão encerrada — entre novamente');
    }
    const perms = await this.db
      .select({ recurso: permissoes.recurso })
      .from(permissoes)
      .where(and(eq(permissoes.usuarioId, user.id), eq(permissoes.permitido, true)));
    return {
      userId: user.id,
      tenantId: user.tenantId,
      tipoUsuario: user.tipoUsuario,
      permissoes: perms.map((p) => p.recurso),
      ehAdminPlataforma: user.ehAdminPlataforma,
    };
  }
}
