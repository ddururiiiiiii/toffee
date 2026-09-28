import { Equals, IsOptional, IsString, MaxLength } from 'class-validator';

// 필수 동의 두 가지를 각각 체크했는지 — 둘 다 true여야 함. version은 앱이 보여준 약관 버전(옛 화면으로 동의하는 것 방지)
export class AcceptTermsDto {
  @IsString()
  version!: string;

  @Equals(true, { message: '이용약관에 동의해야 이용할 수 있어요.' })
  agreeTerms!: boolean;

  @Equals(true, { message: '개인정보 수집·이용에 동의해야 이용할 수 있어요.' })
  agreePrivacy!: boolean;

  // 기기 지역(ISO 국가 코드)·플랫폼 — 미성년 기준 나이·통계용, 형식이 이상하면 서버가 무시
  @IsOptional()
  @IsString()
  @MaxLength(10)
  countryCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  platform?: string;
}
