import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: string; // usuarioId
  tenantId: string;
  tipoUsuario: 'ADMIN' | 'PADRAO';
  permissoes: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') || 'dev-secret-change-me',
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
    };
  }
}
