import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class PushDeviceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  token!: string;

  @IsOptional()
  @IsIn(['ios', 'android'])
  platform?: 'ios' | 'android';
}
