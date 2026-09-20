import { Module } from '@nestjs/common';
import { AtasModule } from '../atas/atas.module';
import { ContratosModule } from '../contratos/contratos.module';
import { LicitacoesService } from './licitacoes.service';
import { LicitacoesController } from './licitacoes.controller';

@Module({ imports: [AtasModule, ContratosModule], providers: [LicitacoesService], controllers: [LicitacoesController], exports: [LicitacoesService] })
export class LicitacoesModule {}
