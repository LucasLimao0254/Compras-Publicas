import { IsString } from 'class-validator';

export class TrocarTenantDto {
  @IsString() usuarioId: string;
}
