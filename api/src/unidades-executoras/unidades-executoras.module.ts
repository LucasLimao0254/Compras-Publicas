import { Module } from '@nestjs/common';
import { UnidadesExecutorasService } from './unidades-executoras.service';
import { UnidadesExecutorasController } from './unidades-executoras.controller';

@Module({ providers: [UnidadesExecutorasService], controllers: [UnidadesExecutorasController], exports: [UnidadesExecutorasService] })
export class UnidadesExecutorasModule {}
