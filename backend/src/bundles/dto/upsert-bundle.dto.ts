import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { MAX_PRICE_CENTS, STORE_PRODUCT_ID_PATTERN } from '../../common/store/store-product.js';

// 묶음 상품 등록/수정(운영자). 배우 ID는 참조라 @IsUUID 대신 @IsString — 존재 여부는 서비스에서 확인
export class CreateBundleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  @IsInt()
  @Min(0)
  @Max(MAX_PRICE_CENTS)
  priceCents!: number;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  actorIds!: string[];

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(STORE_PRODUCT_ID_PATTERN)
  storeProductId?: string | null;
}

export class UpdateBundleDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE_CENTS)
  priceCents?: number;

  // 구독 중인 팬이 있으면 바꿀 수 없음(BUNDLE_IN_USE)
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  actorIds?: string[];

  // null이면 지움, 빼면 그대로
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(STORE_PRODUCT_ID_PATTERN)
  storeProductId?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
