import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermission } from '../common/require-permission.decorator';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { AditivosService } from './aditivos.service';
import { CreateAditivoDto } from './dto/aditivo.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('compras.contratos')
@Controller('contratos/:contratoId/aditivos')
export class AditivosController {
  constructor(private service: AditivosService) {}

  @Get() list(@CurrentUser() u: AuthUser, @Param('contratoId') contratoId: string) {
    return this.service.list(u.tenantId, contratoId);
  }

  @Post() create(@CurrentUser() u: AuthUser, @Param('contratoId') contratoId: string, @Body() dto: CreateAditivoDto) {
    return this.service.create(u.tenantId, contratoId, dto);
  }
}
