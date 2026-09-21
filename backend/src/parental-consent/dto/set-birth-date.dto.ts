import { IsDateString } from 'class-validator';

export class SetBirthDateDto {
  @IsDateString()
  birthDate!: string;
}
