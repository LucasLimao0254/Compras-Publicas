import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermission, TELAS_QUE_LEEM_CADASTROS_DE_APOIO } from '../common/require-permission.decorator';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { LicitacoesService } from './licitacoes.service';
import { LicitacaoDto } from './dto/licitacao.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('compras.licitacoes')
@Controller('licitacoes')
export class LicitacoesController {
  constructor(private service: LicitacoesService) {}

  @RequirePermission(['compras.licitacoes', ...TELAS_QUE_LEEM_CADASTROS_DE_APOIO])
  @Get() list(@CurrentUser() u: AuthUser) { return this.service.list(u.tenantId); }
  @RequirePermission(['compras.licitacoes', ...TELAS_QUE_LEEM_CADASTROS_DE_APOIO])
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service.get(u.tenantId, id); }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: LicitacaoDto) { return this.service.create(u.tenantId, dto); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: LicitacaoDto) { return this.service.update(u.tenantId, id, dto); }
  @Delete(':id') remove(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service.remove(u.tenantId, id); }

  @Get(':id/derivados')
  derivados(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.service.derivados(u.tenantId, id);
  }
}
