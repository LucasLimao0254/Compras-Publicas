import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermission, TELAS_QUE_LEEM_CADASTROS_DE_APOIO } from '../common/require-permission.decorator';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { DotacoesService } from './dotacoes.service';
import { DotacaoDto } from './dto/dotacao.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('compras.contratos')
@Controller('dotacoes')
export class DotacoesController {
  constructor(private service: DotacoesService) {}

  @RequirePermission(['compras.contratos', ...TELAS_QUE_LEEM_CADASTROS_DE_APOIO])
  @Get() list(@CurrentUser() u: AuthUser) { return this.service.list(u.tenantId); }
  @RequirePermission(['compras.contratos', ...TELAS_QUE_LEEM_CADASTROS_DE_APOIO])
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service.get(u.tenantId, id); }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: DotacaoDto) { return this.service.create(u.tenantId, dto); }
}
