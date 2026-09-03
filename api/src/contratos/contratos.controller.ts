import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermission } from '../common/require-permission.decorator';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { ContratosService } from './contratos.service';
import { CreateContratoDto, ItemContratoInput, UpdateContratoDto } from './dto/contrato.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('compras.contratos')
@Controller('contratos')
export class ContratosController {
  constructor(private service: ContratosService) {}

  @Get() list(@CurrentUser() u: AuthUser) { return this.service.list(u.tenantId); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service.get(u.tenantId, id); }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateContratoDto) { return this.service.create(u.tenantId, dto); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateContratoDto) { return this.service.update(u.tenantId, id, dto); }

  @Get(':id/itens')
  itens(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.service.itensComSaldo(u.tenantId, id);
  }

  @Post(':id/itens')
  addItem(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ItemContratoInput) {
    return this.service.addItem(u.tenantId, id, dto);
  }
}
