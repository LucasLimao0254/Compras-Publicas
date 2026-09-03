import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermission } from '../common/require-permission.decorator';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { DashboardService } from './dashboard.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('compras.dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private service: DashboardService) {}

  @Get('resumo')
  resumo(@CurrentUser() u: AuthUser) {
    return this.service.resumo(u.tenantId);
  }
}
