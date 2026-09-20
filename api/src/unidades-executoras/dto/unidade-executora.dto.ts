import { IsEmail, IsOptional, IsString } from 'class-validator';

export class UnidadeExecutoraDto {
  @IsString() cnpj: string;
  @IsString() razaoSocial: string;
  @IsOptional() @IsString() endereco?: string;
  @IsOptional() @IsString() cep?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() ordenadorNome?: string;
  @IsOptional() @IsString() ordenadorCargo?: string;
  @IsOptional() @IsString() ordenadorPortaria?: string;
}
