import { IsBoolean } from 'class-validator';

export class AlternarSetorDto {
  @IsBoolean() habilitado: boolean;
}
