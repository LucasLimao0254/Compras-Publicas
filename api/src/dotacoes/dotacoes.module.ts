import { Module } from '@nestjs/common';
import { DotacoesService } from './dotacoes.service';
import { DotacoesController } from './dotacoes.controller';

@Module({ providers: [DotacoesService], controllers: [DotacoesController], exports: [DotacoesService] })
export class DotacoesModule {}
