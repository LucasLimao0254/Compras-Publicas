import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  senha: string;

  // código numérico do município/tenant, exibido no seletor do cabeçalho
  @IsNotEmpty()
  tenantCodigo: number;
}
