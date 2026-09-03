import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermission } from '../common/require-permission.decorator';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { UsuariosService } from './usuarios.service';
import { CreateUsuarioDto, UpdateUsuarioDto } from './dto/usuario.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('administrativo.usuarios')
@Controller('usuarios')
export class UsuariosController {
  constructor(private service: UsuariosService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.tenantId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user.tenantId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateUsuarioDto) {
    return this.service.create(user.tenantId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateUsuarioDto) {
    return this.service.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.tenantId, id);
  }
}
