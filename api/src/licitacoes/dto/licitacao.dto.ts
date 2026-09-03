import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

const MODALIDADES = [
  'PREGAO_PRESENCIAL', 'CONCORRENCIA_PUBLICA', 'DISPENSA', 'INEXIGIBILIDADE', 'CARTA_CONVITE',
  'PREGAO_ELETRONICO', 'CHAMAMENTO_PUBLICO', 'LEILAO', 'CONCURSO', 'ADESAO_ATA', 'RDC_PRESENCIAL', 'DIALOGO_COMPETITIVO',
];

export class LicitacaoDto {
  @IsString() numero: string;
  @IsString() numeroProcesso: string;
  @IsString() objeto: string;
  @IsIn(MODALIDADES) modalidade: string;
  @IsOptional() @IsBoolean() srp?: boolean;
  @IsOptional() @IsBoolean() credenciamento?: boolean;
}
