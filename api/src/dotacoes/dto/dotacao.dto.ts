import { IsOptional, IsString } from 'class-validator';

export class DotacaoDto {
  @IsString() gestaoUnidade: string;
  @IsString() fonteRecursos: string;
  @IsString() programaTrabalho: string;
  @IsOptional() @IsString() elementoDespesa?: string;
}
