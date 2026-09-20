import { Module } from '@nestjs/common';
import { ApostilamentosService } from './apostilamentos.service';
import { ApostilamentosController } from './apostilamentos.controller';

@Module({ providers: [ApostilamentosService], controllers: [ApostilamentosController], exports: [ApostilamentosService] })
export class ApostilamentosModule {}
