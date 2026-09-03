import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermission } from '../common/require-permission.decorator';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { OrdensService } from './ordens.service';
import { CreateOrdemDto } from './dto/ordem.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('compras.ordens')
@Controller('ordens')
export class OrdensController {
  constructor(private service: OrdensService) {}

  @Get() list(@CurrentUser() u: AuthUser) { return this.service.list(u.tenantId); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service.get(u.tenantId, id); }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateOrdemDto) { return this.service.create(u.tenantId, dto); }
  @Post(':id/cancelar') cancelar(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service.cancelar(u.tenantId, id); }
}
