import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermission } from '../common/require-permission.decorator';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { ApostilamentosService } from './apostilamentos.service';
import { CreateApostilamentoDto } from './dto/apostilamento.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('compras.contratos')
@Controller('contratos/:contratoId/apostilamentos')
export class ApostilamentosController {
  constructor(private service: ApostilamentosService) {}

  @Get() list(@CurrentUser() u: AuthUser, @Param('contratoId') contratoId: string) {
    return this.service.list(u.tenantId, contratoId);
  }

  @Post() create(@CurrentUser() u: AuthUser, @Param('contratoId') contratoId: string, @Body() dto: CreateApostilamentoDto) {
    return this.service.create(u.tenantId, contratoId, u.userId, dto);
  }
}
