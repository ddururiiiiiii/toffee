import { IsOptional, IsString } from 'class-validator';

export class ListAgenciesQueryDto {
  @IsOptional()
  @IsString()
  q?: string;
}
