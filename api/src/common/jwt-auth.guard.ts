import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Protege qualquer rota exigindo um JWT válido. O payload decodificado
// (contendo tenantId, userId, permissoes) fica disponível em req.user.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
