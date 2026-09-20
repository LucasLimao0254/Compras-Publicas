import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DbModule } from './db/db.module';
import { AuthModule } from './auth/auth.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { SecretariasModule } from './secretarias/secretarias.module';
import { FornecedoresModule } from './fornecedores/fornecedores.module';
import { LicitacoesModule } from './licitacoes/licitacoes.module';
import { LicitacoesHomologacaoModule } from './licitacoes-homologacao/licitacoes-homologacao.module';
import { ContratosModule } from './contratos/contratos.module';
import { AditivosModule } from './aditivos/aditivos.module';
import { ApostilamentosModule } from './apostilamentos/apostilamentos.module';
import { AtasModule } from './atas/atas.module';
import { DotacoesModule } from './dotacoes/dotacoes.module';
import { OrdensModule } from './ordens/ordens.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { UnidadesExecutorasModule } from './unidades-executoras/unidades-executoras.module';
import { ConfiguracoesModule } from './configuracoes/configuracoes.module';
import { SetoresModule } from './setores/setores.module';
import { PlataformaModule } from './plataforma/plataforma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    AuthModule,
    UsuariosModule,
    SecretariasModule,
    FornecedoresModule,
    LicitacoesModule,
    LicitacoesHomologacaoModule,
    ContratosModule,
    AditivosModule,
    ApostilamentosModule,
    AtasModule,
    DotacoesModule,
    ConfiguracoesModule,
    SetoresModule,
    PlataformaModule,
    UnidadesExecutorasModule,
    OrdensModule,
    DashboardModule,
  ],
})
export class AppModule {}
