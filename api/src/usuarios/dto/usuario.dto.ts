import { IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUsuarioDto {
  @IsString() cpf: string;
  @IsString() nome: string;
  @IsEmail() email: string;
  @IsString() @MinLength(6) senha: string;
  @IsOptional() @IsString() telefone?: string;
  @IsOptional() @IsIn(['ADMIN', 'PADRAO']) tipoUsuario?: 'ADMIN' | 'PADRAO';
  @IsOptional() @IsBoolean() ativo?: boolean;
  @IsOptional() @IsArray() permissoes?: string[];
}

export class UpdateUsuarioDto {
  @IsOptional() @IsString() nome?: string;
  @IsOptional() @IsString() telefone?: string;
  @IsOptional() @IsBoolean() ativo?: boolean;
  @IsOptional() @IsIn(['ADMIN', 'PADRAO']) tipoUsuario?: 'ADMIN' | 'PADRAO';
  @IsOptional() @IsString() @MinLength(6) senha?: string;
  @IsOptional() @IsArray() permissoes?: string[];
}
