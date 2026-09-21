import { IsEmail } from 'class-validator';

export class RequestParentalConsentDto {
  @IsEmail()
  parentEmail!: string;
}
