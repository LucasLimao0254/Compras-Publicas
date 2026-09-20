import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { PlatformAdminGuard } from '../common/platform-admin.guard';
import { PlataformaService } from './plataforma.service';
import { AlternarSetorDto } from './dto/alternar-setor.dto';

@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('plataforma')
export class PlataformaController {
  constructor(private service: PlataformaService) {}

  @Get('tenants')
  tenants() {
    return this.service.tenants();
  }

  @Patch('tenants/:tenantId/setores/:setorId')
  alternarSetor(@Param('tenantId') tenantId: string, @Param('setorId') setorId: string, @Body() dto: AlternarSetorDto) {
    return this.service.alternarSetor(tenantId, setorId, dto.habilitado);
  }
}
