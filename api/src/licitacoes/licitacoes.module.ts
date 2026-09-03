import { Module } from '@nestjs/common';
import { LicitacoesService } from './licitacoes.service';
import { LicitacoesController } from './licitacoes.controller';

@Module({ providers: [LicitacoesService], controllers: [LicitacoesController], exports: [LicitacoesService] })
export class LicitacoesModule {}
