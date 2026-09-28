import { IsString } from 'class-validator';

export class SetBirthDateDto {
  // 형식·달력·미래 여부는 parseBirthDate에서(한국어 메시지로) 검사
  @IsString()
  birthDate!: string;
}
