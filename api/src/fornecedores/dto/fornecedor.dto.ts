import { IsString } from 'class-validator';

export class FornecedorDto {
  @IsString() cnpjCpf: string;
  @IsString() razaoSocial: string;
}
