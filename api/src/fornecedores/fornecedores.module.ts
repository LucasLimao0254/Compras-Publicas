import { Module } from '@nestjs/common';
import { FornecedoresService } from './fornecedores.service';
import { FornecedoresController } from './fornecedores.controller';

@Module({ providers: [FornecedoresService], controllers: [FornecedoresController], exports: [FornecedoresService] })
export class FornecedoresModule {}
