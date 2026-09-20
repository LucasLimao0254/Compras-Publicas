import { Module } from '@nestjs/common';
import { AtasModule } from '../atas/atas.module';
import { ContratosModule } from '../contratos/contratos.module';
import { FornecedoresService } from './fornecedores.service';
import { FornecedoresController } from './fornecedores.controller';

@Module({ imports: [AtasModule, ContratosModule], providers: [FornecedoresService], controllers: [FornecedoresController], exports: [FornecedoresService] })
export class FornecedoresModule {}
