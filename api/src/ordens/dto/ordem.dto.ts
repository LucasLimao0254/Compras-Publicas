import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ItemOrdemInput {
  @IsString() itemContratoId: string;
  @IsNumber() quantidade: number;
}

export class CreateOrdemDto {
  @IsString() contratoId: string;
  @IsOptional() @IsString() dotacaoId?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ItemOrdemInput)
  itens: ItemOrdemInput[];
}
