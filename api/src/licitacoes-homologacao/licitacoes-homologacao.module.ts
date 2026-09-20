import { Module } from '@nestjs/common';
import { LicitacoesHomologacaoService } from './licitacoes-homologacao.service';
import { LicitacoesHomologacaoController } from './licitacoes-homologacao.controller';
import { ExtracaoHomologacaoService } from './extracao-homologacao.service';

@Module({
  providers: [LicitacoesHomologacaoService, ExtracaoHomologacaoService],
  controllers: [LicitacoesHomologacaoController],
  exports: [LicitacoesHomologacaoService],
})
export class LicitacoesHomologacaoModule {}
