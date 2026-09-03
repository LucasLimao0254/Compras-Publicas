import { IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

const FORMAS_FATURAMENTO = ['MENSAL','POR_MEDICAO','POR_ETAPA','POR_ENTREGA','SOB_DEMANDA','PARCELA_UNICA','PAGAMENTO_ANTECIPADO'];
const FORMAS_SALDO = ['NORMAL', 'APENAS_VALOR_TOTAL', 'QTD_VALOR_VARIAVEL'];
const SITUACOES = ['MINUTA', 'VIGENTE', 'ARQUIVADO'];

export class ItemContratoInput {
  @IsString() descricao: string;
  @IsString() unidade: string;
  @IsNumber() quantidade: number;
  @IsNumber() valorUnitario: number;
}

export class CreateContratoDto {
  @IsString() numero: string;
  @IsString() numeroProcesso: string;
  @IsString() objeto: string;
  @IsString() licitacaoId: string;
  @IsString() orgaoGerenciadorId: string;
  @IsString() fornecedorId: string;
  @IsOptional() @IsString() fiscalId?: string;
  @IsDateString() vigenciaInicial: string;
  @IsDateString() vigenciaFinal: string;
  @IsOptional() @IsDateString() dataAssinatura?: string;
  @IsIn(FORMAS_FATURAMENTO) formaFaturamento: string;
  @IsOptional() @IsIn(FORMAS_SALDO) formaControleSaldo?: string;
  @IsOptional() @IsIn(SITUACOES) situacao?: string;
  @IsOptional() @IsArray() itens?: ItemContratoInput[];
  @IsOptional() @IsArray() dotacaoIds?: string[];
}

export class UpdateContratoDto {
  @IsOptional() @IsString() objeto?: string;
  @IsOptional() @IsDateString() vigenciaInicial?: string;
  @IsOptional() @IsDateString() vigenciaFinal?: string;
  @IsOptional() @IsIn(SITUACOES) situacao?: string;
}
