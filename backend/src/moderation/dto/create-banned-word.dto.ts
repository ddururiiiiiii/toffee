import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateBannedWordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  term!: string;

  @IsIn(['ko', 'th', 'en'])
  language!: string;
}
