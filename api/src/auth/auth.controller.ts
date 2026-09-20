import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { TrocarTenantDto } from './dto/trocar-tenant.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('tenants-disponiveis')
  tenantsDisponiveis(@CurrentUser() u: AuthUser) {
    return this.authService.tenantsDisponiveis(u.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('trocar-tenant')
  trocarTenant(@CurrentUser() u: AuthUser, @Body() dto: TrocarTenantDto) {
    return this.authService.trocarTenant(u.userId, dto.usuarioId);
  }
}
