import { IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

/**
 * PC 웹 소셜 로그인(카카오·네이버·LINE, 2026-09-29) — 각 회사 로그인 페이지가 우리 웹 주소로 돌려준 1회용 code를 서버가 비밀키로
 * 토큰과 바꿈. redirectUri는 로그인 요청 때 쓴 주소 그대로(회사 쪽이 같은지 확인함) — 서버도 WEB_LOGIN_ORIGINS 안의 주소만 받음.
 */
export class WebCodeLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  code!: string;

  @IsUrl({ require_tld: false, require_protocol: true })
  redirectUri!: string;

  // 네이버는 토큰 교환 때도 state를 보내야 함
  @IsOptional()
  @IsString()
  @MaxLength(200)
  state?: string;
}
