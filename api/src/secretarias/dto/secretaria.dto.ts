import { IsOptional, IsString } from 'class-validator';

export class SecretariaDto {
  @IsString() titulo: string;
  @IsOptional() @IsString() codigoUnidadePncp?: string;
}
