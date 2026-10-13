import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermission } from '../common/require-permission.decorator';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { OrdensService } from './ordens.service';
import { CreateOrdemDto, UpdateOrdemDto } from './dto/ordem.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('compras.ordens')
@Controller('ordens')
export class OrdensController {
  constructor(private service: OrdensService) {}

  @Get()
  list(
    @CurrentUser() u: AuthUser,
    @Query('status') status?: string,
    @Query('numero') numero?: string,
    @Query('licitacaoId') licitacaoId?: string,
    @Query('contratoId') contratoId?: string,
    @Query('secretariaId') secretariaId?: string,
    @Query('fornecedorId') fornecedorId?: string,
  ) {
    return this.service.list(u.tenantId, { status, numero, licitacaoId, contratoId, secretariaId, fornecedorId });
  }

  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service.get(u.tenantId, id); }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateOrdemDto) { return this.service.create(u.tenantId, u.userId, dto); }
  @Post(':id/emitir') emitir(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service.emitir(u.tenantId, u.userId, id); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateOrdemDto) { return this.service.update(u.tenantId, u.userId, u.tipoUsuario, id, dto); }
  @Patch(':id/cancelar') cancelar(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service.cancelar(u.tenantId, u.userId, id, u.tipoUsuario); }
  @Get(':id/historico') historico(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service.historico(u.tenantId, id); }
}
