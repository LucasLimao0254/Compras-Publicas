import { Module } from '@nestjs/common';
import { SaldoCeilingService } from './saldo-ceiling.service';

@Module({ providers: [SaldoCeilingService], exports: [SaldoCeilingService] })
export class SaldoCeilingModule {}
