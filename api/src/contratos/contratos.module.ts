import { Module } from '@nestjs/common';
import { ContratosService } from './contratos.service';
import { ContratosController } from './contratos.controller';

@Module({ providers: [ContratosService], controllers: [ContratosController], exports: [ContratosService] })
export class ContratosModule {}
