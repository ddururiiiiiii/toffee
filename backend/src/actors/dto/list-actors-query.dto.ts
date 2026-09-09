import { IsOptional, IsString } from 'class-validator';

export class ListActorsQueryDto {
  @IsOptional()
  @IsString()
  q?: string;
}
