import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermission, TELAS_QUE_LEEM_CADASTROS_DE_APOIO } from '../common/require-permission.decorator';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { SecretariasService } from './secretarias.service';
import { SecretariaDto } from './dto/secretaria.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('administrativo.secretarias')
@Controller('secretarias')
export class SecretariasController {
  constructor(private service: SecretariasService) {}

  @RequirePermission(['administrativo.secretarias', ...TELAS_QUE_LEEM_CADASTROS_DE_APOIO])
  @Get() list(@CurrentUser() u: AuthUser) { return this.service.list(u.tenantId); }
  @RequirePermission(['administrativo.secretarias', ...TELAS_QUE_LEEM_CADASTROS_DE_APOIO])
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service.get(u.tenantId, id); }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: SecretariaDto) { return this.service.create(u.tenantId, dto); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: SecretariaDto) { return this.service.update(u.tenantId, id, dto); }
  @Delete(':id') remove(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service.remove(u.tenantId, id); }
}
