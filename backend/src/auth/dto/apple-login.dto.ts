import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AppleLoginDto {
  @IsString()
  @IsNotEmpty()
  idToken!: string;

  // 애플은 idToken에 이름을 절대 안 담아줌 — 최초 로그인 때 클라이언트가
  // ASAuthorizationAppleIDCredential에서 받은 이름을 여기로 같이 보내야 함
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  agreedToTerms?: boolean;
}
