import { IsArray, IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

const FORMAS_FATURAMENTO = ['MENSAL','POR_MEDICAO','POR_ETAPA','POR_ENTREGA','SOB_DEMANDA','PARCELA_UNICA','PAGAMENTO_ANTECIPADO'];
const FORMAS_SALDO = ['NORMAL', 'APENAS_VALOR_TOTAL', 'QTD_VALOR_VARIAVEL'];
const SITUACOES = ['MINUTA', 'VIGENTE', 'ARQUIVADO'];

export class ItemContratoInput {
  @IsString() descricao: string;
  @IsString() unidade: string;
  @IsNumber() @IsPositive() quantidade: number;
  @IsNumber() @IsPositive() valorUnitario: number;
  // Item-mestre da homologação de onde esta linha abate saldo — ver
  // SaldoCeilingService. Só válido quando o contrato tem ataOrgaoId ou
  // homologacaoFornecedorId preenchido.
  @IsOptional() @IsString() homologacaoItemId?: string;
}

export class CreateContratoDto {
  @IsString() numero: string;
  @IsString() numeroProcesso: string;
  @IsString() objeto: string;
  @IsString() licitacaoId: string;
  @IsString() orgaoGerenciadorId: string;
  @IsString() fornecedorId: string;
  @IsOptional() @IsString() fiscalId?: string;
  // De onde o contrato abate saldo, quando vem da cadeia de homologação — no
  // máximo um dos dois (ver ContratosService.create). Imutável depois de
  // criado; nunca adicione estes campos em UpdateContratoDto.
  @IsOptional() @IsString() ataOrgaoId?: string;
  @IsOptional() @IsString() homologacaoFornecedorId?: string;
  @IsDateString() vigenciaInicial: string;
  @IsDateString() vigenciaFinal: string;
  @IsOptional() @IsDateString() dataAssinatura?: string;
  @IsIn(FORMAS_FATURAMENTO) formaFaturamento: string;
  @IsOptional() @IsIn(FORMAS_SALDO) formaControleSaldo?: string;
  @IsOptional() @IsIn(SITUACOES) situacao?: string;
  // Sem @ValidateNested/@Type, o ValidationPipe não valida nada dentro de
  // cada item — quantidade negativa passava e reduzia o consumo do teto.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemContratoInput)
  itens?: ItemContratoInput[];
  @IsOptional() @IsArray() @IsString({ each: true }) dotacaoIds?: string[];
}

export class UpdateContratoDto {
  @IsOptional() @IsString() @IsNotEmpty() numero?: string;
  @IsOptional() @IsString() @IsNotEmpty() numeroProcesso?: string;
  @IsOptional() @IsString() objeto?: string;
  @IsOptional() @IsIn(FORMAS_FATURAMENTO) formaFaturamento?: string;
  @IsOptional() @IsDateString() vigenciaInicial?: string;
  @IsOptional() @IsDateString() vigenciaFinal?: string;
  @IsOptional() @IsIn(SITUACOES) situacao?: string;
  // Trocar para 'APENAS_VALOR_TOTAL' é rejeitado quando o contrato tem
  // origem (ataOrgaoId/homologacaoFornecedorId) — ver
  // ContratosService.validarFormaControleSaldo.
  @IsOptional() @IsIn(FORMAS_SALDO) formaControleSaldo?: string;
}
