import { Injectable } from '@nestjs/common';
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
  constructor(config: ConfigService) {
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

  async validate(payload: JwtPayload) {
    // Tudo que a aplicação precisa para checar tenant e permissão em qualquer
    // rota, sem nova consulta ao banco a cada request.
    return {
      userId: payload.sub,
      tenantId: payload.tenantId,
      tipoUsuario: payload.tipoUsuario,
      permissoes: payload.permissoes,
      ehAdminPlataforma: payload.ehAdminPlataforma,
    };
  }
}
