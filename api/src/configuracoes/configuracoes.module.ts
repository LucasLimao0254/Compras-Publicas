import { Module } from '@nestjs/common';
import { ConfiguracoesService } from './configuracoes.service';
import { ConfiguracoesController } from './configuracoes.controller';

@Module({ providers: [ConfiguracoesService], controllers: [ConfiguracoesController], exports: [ConfiguracoesService] })
export class ConfiguracoesModule {}
