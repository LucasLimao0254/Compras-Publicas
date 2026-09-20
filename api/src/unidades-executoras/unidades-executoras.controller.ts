import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermission } from '../common/require-permission.decorator';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { UnidadesExecutorasService } from './unidades-executoras.service';
import { UnidadeExecutoraDto } from './dto/unidade-executora.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('compras.configuracoes')
@Controller('unidades-executoras')
export class UnidadesExecutorasController {
  constructor(private service: UnidadesExecutorasService) {}

  @Get() list(@CurrentUser() u: AuthUser) { return this.service.list(u.tenantId); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service.get(u.tenantId, id); }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: UnidadeExecutoraDto) { return this.service.create(u.tenantId, dto); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UnidadeExecutoraDto) { return this.service.update(u.tenantId, id, dto); }
  @Delete(':id') remove(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service.remove(u.tenantId, id); }
}
