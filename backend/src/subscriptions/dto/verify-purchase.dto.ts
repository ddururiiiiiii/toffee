import { IsIn, IsNotEmpty, IsString, ValidateIf } from 'class-validator';

export class VerifyPurchaseDto {
  @IsIn(['IOS', 'ANDROID'])
  platform!: 'IOS' | 'ANDROID';

  // Google 검증엔 필요(스토어에 등록한 구독 상품 ID), Apple 검증엔 안 씀(영수증 안에 이미 들어있음)
  @ValidateIf((dto: VerifyPurchaseDto) => dto.platform === 'ANDROID')
  @IsString()
  @IsNotEmpty()
  productId?: string;

  // iOS — expo-iap Purchase의 purchaseToken(StoreKit2 서명 트랜잭션, JWS 문자열)
  @ValidateIf((dto: VerifyPurchaseDto) => dto.platform === 'IOS')
  @IsString()
  @IsNotEmpty()
  signedTransaction?: string;

  // Android — expo-iap Purchase의 purchaseToken
  @ValidateIf((dto: VerifyPurchaseDto) => dto.platform === 'ANDROID')
  @IsString()
  @IsNotEmpty()
  purchaseToken?: string;
}
