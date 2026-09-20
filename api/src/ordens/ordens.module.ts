import { Module } from '@nestjs/common';
import { ConfiguracoesModule } from '../configuracoes/configuracoes.module';
import { OrdensService } from './ordens.service';
import { OrdensController } from './ordens.controller';

@Module({ imports: [ConfiguracoesModule], providers: [OrdensService], controllers: [OrdensController], exports: [OrdensService] })
export class OrdensModule {}
