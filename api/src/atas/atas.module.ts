import { Module } from '@nestjs/common';
import { SaldoCeilingModule } from '../saldo-ceiling/saldo-ceiling.module';
import { ContratosModule } from '../contratos/contratos.module';
import { AtasService } from './atas.service';
import { AtasController } from './atas.controller';

@Module({ imports: [SaldoCeilingModule, ContratosModule], providers: [AtasService], controllers: [AtasController], exports: [AtasService] })
export class AtasModule {}
