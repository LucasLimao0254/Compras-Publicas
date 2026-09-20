import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

const TIPOS_ATA = ['ATAS', 'CREDENCIAMENTO'];
const FORMAS_SALDO = ['NORMAL', 'APENAS_VALOR_TOTAL', 'QTD_VALOR_VARIAVEL'];
const SITUACOES_ATA = ['VIGENTE', 'ARQUIVADO'];
const PERFIS_ORGAO = ['GERENCIADOR', 'PARTICIPANTE'];

export class OrgaoAtaInput {
  @IsString() secretariaId: string;
  @IsIn(PERFIS_ORGAO) perfil: string;
}

export class CreateAtaDto {
  @IsOptional() @IsIn(TIPOS_ATA) tipo?: string;
  @IsString() numeroArp: string;
  @IsString() licitacaoId: string;
  @IsString() detentorPrincipalId: string;
  // Preenchido quando a ata nasce de uma homologação revisada — trava (no
  // máximo uma ata por fornecedor homologado, ver AtasService.create).
  @IsOptional() @IsString() homologacaoFornecedorId?: string;
  @IsDateString() vigenciaInicial: string;
  @IsDateString() vigenciaFinal: string;
  @IsOptional() @IsBoolean() atasComLotes?: boolean;
  @IsOptional() @IsIn(FORMAS_SALDO) formaControleSaldo?: string;
  @IsOptional() @IsInt() casasDecimaisValor?: number;
  @IsOptional() @IsInt() casasDecimaisQuantidade?: number;
  @IsOptional() @IsIn(SITUACOES_ATA) situacao?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrgaoAtaInput)
  orgaos?: OrgaoAtaInput[];
}

export class UpdateAtaDto {
  @IsOptional() @IsString() numeroArp?: string;
  @IsOptional() @IsDateString() vigenciaInicial?: string;
  @IsOptional() @IsDateString() vigenciaFinal?: string;
  @IsOptional() @IsIn(SITUACOES_ATA) situacao?: string;
}

export class ItemAtaInput {
  @IsString() descricao: string;
  @IsString() unidade: string;
  @IsNumber() @IsPositive() quantidade: number;
  @IsNumber() @IsPositive() valorUnitario: number;
  @IsOptional() @IsString() loteId?: string;
  // Item-mestre da homologação de onde este item de ata abate — ver
  // SaldoCeilingService.homologacaoItemSaldoDisponivel.
  @IsOptional() @IsString() homologacaoItemId?: string;
}

export class RemanejarSaldoDto {
  @IsString() ataItemOrigemId: string;
  @IsString() ataItemDestinoId: string;
  @IsNumber() @IsPositive() quantidade: number;
}

export class LoteAtaInput {
  @IsString() numero: string;
  @IsString() nome: string;
}
