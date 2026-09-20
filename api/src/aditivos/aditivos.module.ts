import { Module } from '@nestjs/common';
import { ContratosModule } from '../contratos/contratos.module';
import { SaldoCeilingModule } from '../saldo-ceiling/saldo-ceiling.module';
import { AditivosService } from './aditivos.service';
import { AditivosController } from './aditivos.controller';

@Module({ imports: [ContratosModule, SaldoCeilingModule], providers: [AditivosService], controllers: [AditivosController], exports: [AditivosService] })
export class AditivosModule {}
