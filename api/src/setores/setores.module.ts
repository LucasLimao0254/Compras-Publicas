import { Module } from '@nestjs/common';
import { SetoresService } from './setores.service';
import { ModulosController } from './modulos.controller';

@Module({ providers: [SetoresService], controllers: [ModulosController], exports: [SetoresService] })
export class SetoresModule {}
