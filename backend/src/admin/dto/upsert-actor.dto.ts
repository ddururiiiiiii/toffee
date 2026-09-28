import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Max, Min, ValidateIf } from 'class-validator';

// 가격은 사타앙(1/100바트) 단위 정수 — 실제 결제 금액은 스토어 상품 가격이 기준이고, 이 값은 앱 표시용
// + 동시구독 할인 계산용(STATUS "구독하기" 참고). 상한은 오입력 방지용 잠정값(฿10,000).
const MAX_PRICE_CENTS = 1_000_000;

export class CreateActorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  legalName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  chatDisplayName!: string;

  @IsInt()
  @Min(0)
  @Max(MAX_PRICE_CENTS)
  monthlyPriceCents!: number;

  // 참조 ID라 @IsUUID 대신 @IsString — 존재 여부는 서비스에서 확인
  @IsOptional()
  @IsString()
  agencyId?: string;
}

export class UpdateActorDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  legalName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  chatDisplayName?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE_CENTS)
  monthlyPriceCents?: number;

  @IsOptional()
  @IsBoolean()
  verified?: boolean;
}

// 프로필 이미지 교체 — 값은 POST /admin/uploads로 받은 objectKey, null이면 삭제, 필드를 빼면 그대로
export class UpdateActorImagesDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  officialProfileImageKey?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  chatProfileImageKey?: string | null;
}

// 배우 본인 계정 연결 — null이면 연결 해제. ACTOR 역할 계정만 연결 가능
export class LinkActorUserDto {
  @ValidateIf((_, value) => value !== null)
  @IsString()
  userId!: string | null;
}
