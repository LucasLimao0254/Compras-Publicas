import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq } from 'drizzle-orm';
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

    const perms = await this.db
      .select({ recurso: permissoes.recurso })
      .from(permissoes)
      .where(and(eq(permissoes.usuarioId, user.id), eq(permissoes.permitido, true)));

    const payload = {
      sub: user.id,
      tenantId: tenant.id,
      tipoUsuario: user.tipoUsuario,
      permissoes: perms.map((p) => p.recurso),
    };

    return {
      accessToken: await this.jwt.signAsync(payload),
      usuario: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        tipoUsuario: user.tipoUsuario,
        permissoes: payload.permissoes,
      },
      tenant: { id: tenant.id, codigo: tenant.codigo, nome: tenant.nome },
    };
  }
}
