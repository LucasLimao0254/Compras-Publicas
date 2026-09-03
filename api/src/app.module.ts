import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DbModule } from './db/db.module';
import { AuthModule } from './auth/auth.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { SecretariasModule } from './secretarias/secretarias.module';
import { FornecedoresModule } from './fornecedores/fornecedores.module';
import { LicitacoesModule } from './licitacoes/licitacoes.module';
import { ContratosModule } from './contratos/contratos.module';
import { DotacoesModule } from './dotacoes/dotacoes.module';
import { OrdensModule } from './ordens/ordens.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    AuthModule,
    UsuariosModule,
    SecretariasModule,
    FornecedoresModule,
    LicitacoesModule,
    ContratosModule,
    DotacoesModule,
    OrdensModule,
    DashboardModule,
  ],
})
export class AppModule {}
