import { Module } from '@nestjs/common';
import { SaldoCeilingModule } from '../saldo-ceiling/saldo-ceiling.module';
import { ContratosService } from './contratos.service';
import { ContratosController } from './contratos.controller';

@Module({ imports: [SaldoCeilingModule], providers: [ContratosService], controllers: [ContratosController], exports: [ContratosService] })
export class ContratosModule {}
