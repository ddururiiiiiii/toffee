# 아키텍처 노트

젤리(gelly) 대비 갭과, 지금 진행 중인 스키마/권한 설계를 "현재 기준"으로 정리. 각 결정이
왜 나왔는지의 맥락은 `docs/deployment-readiness-plan.md`의 해당 날짜 항목 참고.

## 젤리 대비 갭 (2026-09-18 기준)

| 항목 | 상태 |
|---|---|
| 앱 dev/prod 빌드 분리 (`app.config.ts` + `eas.json` 멀티 프로필) | 미착수 |
| Sentry (백엔드+앱) | 미착수 — 가장 시급 |
| CI/CD (`.github/workflows`), 자동 DB 백업 | 미착수 |
| 헬스체크 (`/health/live` 분리) | 미착수 |
| 루트 `CLAUDE.md`, README 컨벤션 문서화 | **이번에 해결** (`CLAUDE.md` 신설) |
| `Actor` 다국어 필드, 앱 i18n 라이브러리 | 미착수 (메시지 번역 테이블은 이미 있음, 아래 참고) |
| 브랜드 팔레트/폰트 적용 | **완료** — `app/src/constants/theme.ts`, Noto Sans Thai |

## 배우 본인 계정 (`Role.ACTOR`) — 구현 완료 (2026-09-18)

- `Role.ACTOR` 추가, `Actor.selfUserId`(1:1, 배우 본인 계정) 필드 신설
  (마이그레이션 `20260918042701_add_actor_self_account`).
- `backend/src/common/authorization/actor-access.ts`에 `ensureIsActorSelf`
  (배우 본인 또는 ADMIN만 — 발송 전용)와 `ensureCanViewActor`(스태프 또는 배우 본인
  또는 ADMIN — 읽기 전용 조회용) 두 헬퍼로 정리. 기존 `ensure-staff-of-actor.ts`는
  삭제하고 이 파일로 통합함.
- `POST /actors/:id/messages/broadcast`: `@Roles(AGENCY_STAFF, ADMIN)` →
  `@Roles(ACTOR, ADMIN)` + `ensureIsActorSelf`로 교체 완료 — 소속사는 더 이상
  발송 불가.
- `GET /actors/:id/messages/replies`, `GET /actors/:id/stats`, `GET /actors/mine`:
  `AGENCY_STAFF`에 `ACTOR`를 추가하고 `ensureCanViewActor`로 교체 — 배우 본인도
  자기 답장/통계를 볼 수 있음.
- `prisma/seed.ts`에 데모 배우 본인 계정(`caramel-self@toffee.demo`, role `ACTOR`,
  `caramel.selfUserId`로 연결) 추가 — `dev-login`으로 로그인해서 실제 발송 테스트 가능.
- **아직 안 한 것**: 배우 전용 업로드/작성 화면(카메라 촬영 → 즉시 업로드, 메시지
  작성) 자체와 그 진입점(앱 `_layout.tsx`의 `AuthGate`가 지금 `ACTOR` role을 아무데도
  리다이렉트하지 않음 — 로그인해도 팬 화면으로 빠짐). 다음 세션에서 화면 설계 필요.

## `Story`/`StoryView` 모델 — 구현 완료 (2026-09-18)

스키마는 설계안 그대로 반영됨(마이그레이션 `20260918043620_add_story_and_video_media_type`).
`backend/src/stories/`에 모듈 추가:

- `POST actors/:actorId/stories` — `@Roles(ACTOR, ADMIN)` + `ensureIsActorSelf`.
  `CreateStoryDto`가 `mediaType !== TEXT`를 검증(스토리는 항상 미디어 있음).
- `GET actors/:actorId/stories` — 로그인만 하면 접근 가능하되 서비스 내부에서
  `ensureActiveSubscription`으로 구독 여부 확인, `expiresAt > now()`인 것만
  `createdAt asc`로 반환.
- `POST actors/:actorId/stories/:storyId/view` — `StoryView.upsert`로 조회 기록
  (중복 호출 안전).
- `GET actors/:actorId/stories/:storyId/views` — `@Roles(AGENCY_STAFF, ACTOR, ADMIN)`
  + `ensureCanViewActor`, 조회한 팬 목록(`viewedAt desc`) 반환.
- 메시지 서비스에 있던 활성 구독 체크를
  `common/authorization/ensure-active-subscription.ts`로 추출해서 재사용.

**버그 수정**: `MessageMediaType`에 `VIDEO`가 없었음(`TEXT`/`PHOTO`/`AUDIO`뿐 —
디자인 가이드는 영상 메시지도 요구). 스토리 작업 중 발견해서 enum에 추가, `Message`
모델의 영상 전송도 이걸로 같이 고쳐짐.

**만료 스토리 정리 cron — 구현 완료 (2026-09-18)**: `@nestjs/schedule` 추가,
`StoriesModule`에 `StoryCleanupService.removeExpiredStories()`가 매시간
(`CronExpression.EVERY_HOUR`) 만료된 `Story` 레코드를 삭제(`StoryView`는
`onDelete: Cascade`로 같이 지워짐). **스토리지 파일 삭제는 여전히 안 함** —
Supabase Storage 같은 실제 파일 저장소 자체가 코드에 연동돼 있지 않아서,
`mediaUrl`이 가리키는 파일은 그대로 남음(스토리지 프로바이더 연동 이후에 후속
작업으로).

**아직 안 한 것**:
- 배우 전용 업로드 화면(카메라 촬영 → 즉시 업로드)과 그 진입점 — `Role.ACTOR` 절
  참고, 여전히 미착수.

## 소속사 모니터링 기능 — 백엔드 구현 완료 (2026-09-18)

- `PushService.notifyActorStaff(actorId, title, body)` 신규 — `Actor.staff` 전원에게
  best-effort로 푸시. `sendBroadcast`, 스토리 `create` 양쪽에서 팬 알림과 별개로 호출.
- `GET actors/:actorId/messages/broadcasts`(신규, `AGENCY_STAFF/ACTOR/ADMIN`) — 배우가
  보낸 메시지를 `{{name}}` 치환 없이 원문 그대로 반환(`ensureCanViewActor`).
- `stories.listActive`가 `requesterRole`을 받아서, `AGENCY_STAFF/ACTOR/ADMIN`이면
  `ensureCanViewActor`로(구독 여부 무관하게 모니터링 목적 접근), 일반 팬이면 기존대로
  `ensureActiveSubscription`으로 분기.
- **아직 안 한 것**: 앱/웹 쪽에 이 엔드포인트들을 실제로 보여주는 화면 자체가 없음
  (지금은 API만 존재). 팬 개인정보 노출 범위(답장의 "팬 이름"이 닉네임/실명인지)도
  여전히 미확인.

## 관리자(ADMIN) 전용 UI — 아직 전혀 없음 (2026-09-18 확인)

사용자 질문으로 확인된 사실: `ADMIN` role은 모든 엔드포인트에 접근은 가능하지만
(`ensureCanViewActor`/`ensureIsActorSelf`가 ADMIN을 항상 통과시킴), **ADMIN 전용
화면이 웹/앱 어디에도 없음** — 이미 백엔드가 완성된 신고 처리(`reports` 모듈)조차
UI가 없어서 지금은 API를 직접 호출해야만 씀. 곧 만들 콘텐츠 모더레이션/회원 관리도
전부 ADMIN 전용 기능이라, 이 문제를 먼저 정리하지 않으면 계속 "백엔드만 있고 못 쓰는"
기능이 쌓임 — 다음 논의·구현 대상. 제품 관점 결정은 `docs/product/feature-decisions.md`
참고.

## 콘텐츠 모더레이션 / 회원 관리 / 운영자 UI — 구현 완료 (2026-09-18)

마이그레이션 `20260918044811_add_moderation_and_user_status`.

- `BannedWord`(term, language) 모델 + `backend/src/moderation/ModerationService
  .assertNoBannedWords(text)` — 전체 목록을 매번 조회해서 대소문자 무시 부분
  문자열 매치(언어 구분 없이 전체 대조). `messages.service.ts`의 `sendReply()`가
  저장 전에 호출, 걸리면 400으로 거부(마스킹 아님).
- `User.status`(`ACTIVE`/`SUSPENDED`/`BANNED`) + `suspendedUntil`/`bannedAt`.
  `JwtStrategy.validate()`에서 매 요청마다 체크: `BANNED`는 항상 거부,
  `SUSPENDED`는 `suspendedUntil`이 아직 안 지났을 때만 거부 — 기간이 지나면
  상태값을 안 건드려도 자동으로 다시 로그인 가능(별도 재활성화 불필요).
- 신규 `admin` 모듈: `GET/PATCH /admin/users`(목록+검색, `:id/suspend`
  `{ until }`, `:id/ban`, `:id/reactivate`) — 전부 `@Roles(ADMIN)`.
- 신규 `moderation` 모듈의 `BannedWordsController`: `GET/POST/DELETE
  /admin/banned-words` — 전부 `@Roles(ADMIN)`.
- `prisma/seed.ts`에 데모 금칙어 3개(언어별 테스트 문자열, 실제 욕설 아님) 추가.

## 일본어/중국어 답장 검열 — LLM 기반으로, 스펙 확정·구현 전 (2026-09-21)

제품 결정은 `docs/product/feature-decisions.md`의 "일본어/중국어 답장 검열 방식"
절 참고. 한국어/태국어/영어는 기존 `ModerationService.assertNoBannedWords()`
그대로 유지, **일본어/중국어만 LLM 판단으로 대체**하는 하이브리드 구조.

- **분기 방식**: `sendReply()`에서 팬의 언어(또는 답장 텍스트의 감지된 언어)가
  `ko`/`th`/`en`이면 기존 `assertNoBannedWords()`, `ja`/`zh`면 신규
  `ModerationService.assertNotInappropriateViaLlm(text)` 호출. 팬의 "언어"를
  어떻게 판정할지(가입 시 선택한 UI 언어 기준 vs 텍스트 자동 감지)는 구현 시 결정
  필요 — 번역 대상 언어 판정 로직과 통일하는 게 자연스러움.
- **LLM 호출**: 번역 엔진이 아직 미정이라(위 "메시지 번역" 절 참고) 이 판단도 같은
  엔진으로 갈지, 아니면 검열 전용으로 별도 엔진/모델을 쓸지는 번역 엔진 확정 시
  같이 정할 것. 프롬프트는 "이 텍스트가 욕설/음란한 표현을 포함하는가"를
  `true`/`false` 또는 구조화된 출력(`output_config.format`, Claude 기준)으로
  받는 짧은 분류 작업이라 저비용 모델(예: Claude Haiku 4.5)로 충분할 것으로 예상.
- **실패 처리**: LLM 호출이 실패(타임아웃/에러)했을 때 기본 동작을 "차단"과
  "통과" 중 무엇으로 할지 아직 미정 — 안전 우선이면 실패 시 차단(팬에게 재시도
  요청)이 맞아 보이나, 확정은 구현 시.
- 기존 `assertNoBannedWords()`는 변경 없음 — 완전히 별개의 신규 메서드로 추가.

**아직 시작 안 함**: 언어 판정 로직, LLM 호출 서비스, 실패 시 기본 동작 전부
미착수. 번역 엔진이 정해지면 같이 정리하는 게 효율적(같은 LLM API 클라이언트를
재사용할 가능성이 높음).

**앱 쪽 — 운영자 전용 화면 자체가 아예 없었음(신고 처리 기능도 UI 없이 방치돼
있었음)**. `app/src/app/admin/`에 신규:
- `admin/index.tsx` — 메뉴(신고 처리/금칙어 관리/회원 관리) + 로그아웃.
- `admin/reports.tsx` — 기존 `GET /reports/pending` + resolve/dismiss 연결.
- `admin/banned-words.tsx` — 목록 + 추가 폼(언어 선택 칩) + 삭제.
- `admin/users.tsx` — 검색 + 정지(1/3/7일 버튼)/영구차단/재활성화.
- `_layout.tsx`의 `AuthGate`: 로그인 후 분기를 `ADMIN → /admin`,
  `AGENCY_STAFF → /console`, 나머지 → 팬 탭으로 3분기.

**같이 발견해서 고친 회귀**: `console/[actorId].tsx`의 "발송" 탭이 여전히
`useSendBroadcast`(`POST .../broadcast`)를 호출하고 있었는데, 그 엔드포인트는
이전 커밋에서 이미 `AGENCY_STAFF`를 빼고 `ACTOR`/`ADMIN`만 허용하도록 바꿔서
소속사 계정으로는 403이 나는 상태였음. "발송" 탭을 지우고, 새로 만든
`GET .../messages/broadcasts` + `GET .../stories`를 합쳐 보여주는 읽기 전용
"모니터링" 탭으로 교체.

## 사업 운영 체크리스트 항목 — 구현 범위 확정 (2026-09-18)

제품 결정은 `docs/product/business-compliance-checklist.md` 참고. 4개 항목 전부
구현 범위에 포함하기로 함, 아래는 기술 작업 목록(아직 미착수):

- **IAP**: `backend/src/subscriptions/subscriptions.service.ts:20`에 이미
  "결제(IAP)는 계약 성사 후에 붙임 — 지금은 결제 없이 구독 레코드만 만드는 샌드박스
  플로우"라는 주석이 있어서, 애초에 IAP로 갈 계획이었던 것과 일치함. 실제 연동 시
  `react-native-iap`(또는 Expo의 IAP 모듈) + 백엔드 영수증 검증 엔드포인트 필요,
  구독 가격에 앱스토어 수수료(15~30%) 반영 필요.
- **약관/개인정보처리방침 화면**: 앱 `Profile` 메뉴에 "Terms & Privacy" 항목이 이미
  디자인 가이드(`docs/product/brand/DESIGN_GUIDE.md` 10절)에 있음 — 정적 페이지/화면과
  앱스토어 메타데이터 링크 추가 필요. 실제 법률 문구는 변호사 자문 후 채워 넣을 것
  (지금은 placeholder로 화면 뼈대만 만들 수 있음).
- **해외 정산 세무**: 코드 작업 아님, 내부 운영 프로세스 — 정산 배치 로직을 만들 때
  "원천징수분 차감" 여지를 미리 필드로 남겨두는 정도만 고려(예: `Subscription`이나
  향후 정산 모델에 세금 관련 필드).
- **연령/미성년자 정책**: 구현 방식(가입 시 생년월일 입력 후 자기신고 vs 별도 부모
  동의 플로우 등) 미정 — 다음 세션에서 구체화 필요.

## 브랜드 팔레트/폰트 구현 메모

- `app/src/constants/theme.ts`의 `Colors`가 Charcoal(`#0F1115`)/Lavender(`#7C8CFF`)/
  Periwinkle(`#DCE1FF`)/Cloud(`#F4F6FB`)/White로 교체됨.
- `Fonts.sans`가 `NotoSansThai_400Regular`를 가리키고 `ThemedText`의 `styles.base`에
  전역 적용됨. 지금은 Regular(400) 굵기만 로드 — 굵기별(Bold 등) 폰트 파일 추가는 후속
  작업.
- `Actor.verified Boolean @default(false)` 필드 추가됨(마이그레이션
  `20260918035538_add_actor_verified`). 배지 UI 자체(채팅 헤더, 프로필 화면)는 아직 안 붙임.

## IAP(인앱결제) 검증 — 스캐폴딩 완료, 실 연동 전 (2026-09-18)

`Subscription`에 `iapPlatform`/`iapTransactionId`(unique)/`iapExpiresAt` 추가
(마이그레이션 `20260918070818_add_iap_fields`). `POST /actors/:actorId/verify-purchase`
신규 — 기존 `POST /actors/:actorId/subscribe`(샌드박스, 결제 없음)는 그대로 두고 병행.

- `backend/src/subscriptions/iap-verification.service.ts`:
  - **Apple**: `@apple/app-store-server-library`의 `SignedDataVerifier`로 로컬 검증.
    StoreKit2가 클라이언트에 주는 건 옛날 base64 영수증이 아니라 **서명된 JWS
    트랜잭션**이라, Apple 서버의 `verifyReceipt`(레거시, deprecated)를 호출하는 방식이
    아니라 Apple 루트 인증서(`AppleRootCA-G3.cer`, 최초 호출 시 받아서 프로세스
    메모리에 캐싱)로 서명을 직접 검증하고 페이로드(`originalTransactionId`,
    `expiresDate`)를 디코딩함.
  - **Google**: Play Developer API `purchases.subscriptions.get`을
    `google-auth-library`(이미 Google 로그인용으로 있던 의존성)의 서비스 계정
    액세스 토큰으로 직접 호출 — `googleapis` 패키지 전체를 새로 넣지 않음.
  - 둘 다 필요한 환경변수(`APPLE_BUNDLE_ID`, `APPLE_IAP_ENVIRONMENT`,
    `GOOGLE_PLAY_PACKAGE_NAME`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`)가 없으면
    `getOrThrow`로 바로 에러 — FCM처럼 조용히 비활성화되지 않음(결제 검증은 절대
    묵시적으로 통과시키면 안 되는 영역이라 의도적으로 이렇게 함).
- 앱: `app/src/hooks/use-purchase.ts`의 `usePurchaseSubscription(actorId)` —
  `expo-iap`의 `useIAP()`로 구매 요청 후 `verify-purchase`에 결과를 넘김.
  **`react-native-iap`가 아니라 `expo-iap`를 씀** — `react-native-iap`(v14+, Nitro
  Modules 기반)는 README에 "Expo Go/Expo Dev Client 미지원, Expo 프로젝트는
  `expo-iap` 쓸 것"이라고 명시돼 있음(처음에 `react-native-iap`를 설치했다가 이
  사실을 확인하고 되돌림 — 같은 실수 반복하지 않도록 기록).
- `app.json` `plugins`에 `"expo-iap"` 추가(별도 옵션 불필요, 기본 StoreKit2 지원).

**아직 실제로 못 하는 것**: 앱스토어 상품(구독) 자체가 등록 안 돼 있어서 이 플로우
전체가 테스트 불가능. 필요한 것: (1) 정식 Bundle ID/패키지명으로 앱스토어/플레이
개발자 계정에 앱 등록, (2) 구독 상품 ID를 `subscriptionSkuForActor()`
(`toffee_sub_{actorId}`) 규칙대로 등록, (3) 위 4개 환경변수 채우기, (4) 실제 EAS
빌드로 기기 테스트(Expo Go/Dev Client에서 결제 자체가 안 됨). 이것들이 끝나기
전까지는 계속 `subscribe`(샌드박스) 플로우를 씀 — `actor/[id].tsx`의 구독 버튼도
아직 `usePurchaseSubscription`으로 안 바꿨음(스토어 준비된 뒤에 교체).

## 법정대리인(부모) 동의 + 약관/개인정보처리방침 화면 — 구현 완료 (2026-09-18)

Bubble 실제 약관("만 14세 미만은 가입 전 법정대리인 동의 필요")을 참고해서 결정 —
14세 미만을 막지 않고 부모 동의 플로우를 구축(마이그레이션
`20260918072541_add_parental_consent`).

- `User.birthDate`/`parentalConsentStatus`(`NOT_REQUIRED`/`PENDING`/`APPROVED`)/
  `parentEmail` + `ParentalConsent`(token, expiresAt, confirmedAt) 모델.
- `PATCH /me/birth-date` — 나이 계산 후 14세 미만이면 `PENDING`으로 전환.
- `POST /me/parental-consent` — 부모 이메일로 확인 링크 발송(`ParentalConsent` upsert).
- `GET /parental-consent/confirm`(`@Public()`) — 부모가 앱 로그인 없이 브라우저에서
  여는 링크, 성공 시 `APPROVED`로 전환.
- `SubscriptionsService.ensureCanSubscribe()` — `PENDING`이면 `subscribe`/
  `verifyPurchase` 둘 다 차단.
- 신규 `EmailService`(Resend REST API 직접 호출) — `RESEND_API_KEY`/
  `EMAIL_FROM_ADDRESS`/`API_PUBLIC_URL` 필요, IAP처럼 미설정 시 조용히 무시하지 않고
  에러(미성년자 보호 장치라 묵시적 우회 방지).
- 앱: `app/src/app/onboarding/{birth-date,parental-consent}.tsx` + `hooks/use-onboarding.ts`.
  `_layout.tsx`의 `AuthGate`가 로그인 직후 `GET /me/onboarding-status`를 확인해서
  생년월일 미입력/`PENDING`이면 온보딩 화면으로 강제 이동.
- 약관/개인정보처리방침: `app/src/app/{terms,privacy}.tsx` — 이번 세션 결정 사항
  (구독 전용, 비대칭 메시징, 스토리 만료, 모더레이션, 미성년자 정책 등)을 반영한
  초안. 화면 상단에 "초안, 출시 전 변호사 검토 필요" 배너 고정 표시. Profile 탭에서
  링크 연결.

**아직 안 한 것**: 실제 소셜 로그인 UI(`login.tsx`는 여전히 dev-login만) 자체가
없어서, `agreedToTerms` 체크박스가 실제 화면에 붙어있지 않음 — 소셜 로그인 UI를
만들 때 이 두 화면 링크를 체크박스와 함께 넣어야 함. 동의 시각/버전을 기록하는
필드도 없음(지금은 API 파라미터로만 검증하고 저장은 안 함).

## CP(페어링) 채팅방 — 스펙 확정, 구현 전 (2026-09-21)

제품 결정은 `docs/product/feature-decisions.md`의 "CP(페어링) 채팅방" 절 참고. 여기는
그걸 구현할 때의 기술적 방향.

- **스키마**: 기존 `Actor`/`Message`/`Subscription`/`Story` 테이블은 건드리지 않는다.
  `GlCp`(지금은 할인 계산용 페어링 메타데이터일 뿐)를 실제 채팅방으로 확장 —
  구체적으로는 `GlCp`에 딸린 신규 모델 두 개를 추가한다:
  - `CpSubscription` — `Subscription`과 같은 패턴(`userId`, `glCpId`,
    `startedAt`/`cancelledAt`, `iapPlatform`/`iapTransactionId`/`iapExpiresAt`).
    `@@unique([userId, glCpId])`.
  - `CpMessage` — `Message`와 같은 패턴이되 `actorId` 대신 `glCpId` +
    `senderActorId`(`GlCp.actorOneId`/`actorTwoId` 중 하나, 어느 배우가 보냈는지
    표시용) + `fanUserId`(nullable, 배우 발송이면 null, 팬 답장이면 그 팬).
    `mediaType`/`body`/`mediaUrl`/`createdAt`은 `Message`와 동일.
  - `{{name}}` 치환은 기존 브로드캐스트 조회 로직을 그대로 재사용(조회 시점에 요청한
    팬의 `displayName`으로 치환).
- **금칙어 필터**: `ModerationService.assertNoBannedWords()`를 CP방 답장 저장 전에도
  그대로 호출(로직 재사용, 신규 언어/목록 불필요).
- **IAP 상품**: 배우 개별 구독 SKU(`toffee_sub_{actorId}`) 패턴을 따라 CP방용
  `toffee_cp_{glCpId}`, 번들용 `toffee_bundle_{glCpId}` 3~4개 SKU를 스토어에 별도
  등록. 번들 구매 검증 시 서버가 `Subscription`(actorOne) + `Subscription`(actorTwo)
  + `CpSubscription`(glCp) 세 레코드를 한 트랜잭션으로 생성.
- **권한**: `ensureCanViewActor`처럼 CP방 전용 `ensureCanViewCpRoom(prisma, userId,
  glCpId)` 헬퍼가 필요 — 스태프는 자기 배우가 `actorOneId`/`actorTwoId` 중 하나로
  걸린 `GlCp`만 조회 가능(상대 배우 소속사에는 노출 안 함). 배우 본인은
  `ensureIsActorSelf`를 `actorOneId`/`actorTwoId` 양쪽에 대해 OR로 체크하는 식으로
  확장.
- **미정 — 구현 시 정할 것**: 팬 신고(`Report`) 기능을 `CpMessage`에도 붙일지, 붙인다면
  `Report.messageId`(현재 `Message`만 참조)를 어떻게 확장할지(nullable +
  `cpMessageId` 컬럼 추가하는 폴리모픽 방식이 가장 단순해 보임 — 확정 아님). 이번
  스펙 논의에는 포함 안 됨.
- 이번 범위에서 CP방 전용 스토리(24시간 소멸 콘텐츠)는 만들지 않음 — 배우 개인
  스토리 기능만 유지.

**아직 시작 안 함**: 위 스펙은 확정됐지만 마이그레이션/서비스/컨트롤러/앱 화면 전부
미착수. 사용자 확인 후 다음 세션(또는 이어지는 작업)에서 구현.

## 아티스트 게시글(영구 게시판) — 스펙 확정, 구현 전 (2026-09-21)

제품 결정은 `docs/product/feature-decisions.md`의 "아티스트 게시글" 절 참고.

- **스키마(안)**: `Story`와 비슷하지만 `expiresAt`이 없는 `ActorPost`(actorId,
  mediaType, body, mediaUrl, createdAt) + `PostComment`(postId, fanUserId,
  parentCommentId nullable, body, createdAt). `parentCommentId`가 가리키는 댓글이
  또 `parentCommentId`를 갖지 않도록(대댓글 1단계 제한) **서비스 레이어에서 검증**
  (부모 댓글의 `parentCommentId`가 이미 not-null이면 400) — DB 제약으로 강제하지
  않음(Prisma self-relation depth 제약은 표현이 번거로움).
- **신고 폴리모피즘 — CP방과 같은 미정 사항**: 지금 `Report.messageId`는 `Message`만
  가리킨다. CP방 스펙(`CpMessage`)에 이어 이번 게시판(`PostComment`)까지 생기면서
  "신고 가능한 대상"이 3종류(`Message`/`CpMessage`/`PostComment`)로 늘어난다. 구현
  시점에 한 번에 정리할 것 — 유력한 방향은 `Report`를 `messageId`/`cpMessageId`/
  `postCommentId` 전부 nullable로 두고 정확히 하나만 채우는 폴리모픽 구조. 확정
  아님, CP방 절의 미정 사항과 같이 묶어서 다음 구현 세션에서 결정.
- **댓글 필터**: 저장 전 `ModerationService.assertNoBannedWords()` 재사용(기존 로직
  그대로).
- **삭제 권한**: `PostComment` 삭제는 `ensureIsActorSelf(postId의 actorId)`를 통과한
  배우 본인 또는 ADMIN만 가능 — 신고(`Report`) 큐를 거치지 않는 별도 엔드포인트로 둔다
  (예: `DELETE actors/:actorId/posts/:postId/comments/:commentId`).
- **소속사 모니터링**: 기존 `GET actors/:actorId/messages/broadcasts` +
  `GET actors/:actorId/stories`를 합쳐 보여주는 앱의 "모니터링" 탭에 게시글도 같은
  방식으로 추가(신규 권한 로직 불필요, `ensureCanViewActor` 재사용).
- 프로필 화면(앱)에 구독자 전용 게시판 섹션 추가 필요 — `actor/[id].tsx`에 구독자
  여부에 따라 조건부 렌더링.

**아직 시작 안 함**: 마이그레이션/서비스/컨트롤러/앱 화면 전부 미착수.

## 대화기록 보존 기간 — 스펙 확정, 구현 전 (2026-09-21)

제품 결정은 `docs/product/feature-decisions.md`의 "대화기록 보존 기간" 절 참고.

- **삭제 대상**: `senderType === FAN`인 `Message`/`CpMessage` 행, 그리고
  `PostComment` 행. `senderType === ARTIST`인 브로드캐스트와 `ActorPost`는
  삭제 대상에서 제외.
- **삭제 조건**: 해당 팬의 `Subscription`(또는 `CpSubscription`)의
  `cancelledAt`이 `not null`이고 `now() - cancelledAt > 1년`인 경우. `Subscription`은
  `@@unique([userId, actorId])`라 재구독 시 기존 행의 `cancelledAt`을 다시 `null`로
  되돌리는 구조 — `subscriptions.service.ts`의 `subscribe()` 로직으로 **확인 완료**
  (재구독 시 새 행을 만들지 않고 기존 행을 `update`하면서 `cancelledAt: null`로
  리셋함, 2026-09-21 코드 확인). 따라서 **재구독하면 조건에 안 걸려서 자동으로
  보존됨** — 별도 "복구" 로직 불필요.
- **PostComment 기준**: 댓글 작성자(`fanUserId`)의 **해당 게시물 작성자(배우)에 대한
  구독**이 위 조건을 만족하면 삭제. CP방 댓글 개념은 없음(게시글은 배우 개인 프로필
  기능이라 CP방과는 무관).
- **cron**: `StoryCleanupService`(매시간 `EVERY_HOUR`)와 별개로 신규
  `RetentionCleanupService`를 만들어 하루 1번(`CronExpression.EVERY_DAY_AT_MIDNIGHT`
  등, 시간대는 태국/한국 새벽 트래픽이 적은 시간대로 결정 필요) 실행 — 삭제 대상이
  많아질 수 있어 스토리 정리보다 빈도를 낮게 잡음.
- **미디어 파일**: 텍스트 행과 동시에 삭제하되, 스토리 정리 때와 마찬가지로 **실제
  파일 스토리지 연동 전까지는 DB 행만 지우고 `mediaUrl`이 가리키는 파일 자체는 못
  지운다** — 스토리지 프로바이더 연동 후 같이 처리할 것(기존 스토리 정리 미해결
  항목과 동일 선상).
- **이용약관 반영 필요**: `app/src/app/terms.tsx` 초안에 이 보존 기간(1년) 조항이
  아직 없음 — 다음에 법률 문구 다듬을 때 같이 추가.

**아직 시작 안 함**: 마이그레이션(불필요, 신규 컬럼 없음)은 없지만 서비스/cron
자체가 미착수.

## 메시지 번역 — LLM 기반으로 방향 전환, 구체적 서비스는 미정 (2026-09-21)

제품 결정은 `docs/product/feature-decisions.md`의 "출시 국가·다국어 범위" 절 참고.
출시 언어는 태국어(`th`)/한국어(`ko`)/영어(`en`)/일본어(`ja`)/중국어(`zh`, 해외
화교권 대상 — 중국 본토 서비스는 범위 밖) 5개로 확정(2026-09-21, 3개 → 5개로 확장).

**번역 엔진 방향이 Google Cloud Translation(전통적 기계번역)에서 LLM 기반으로
바뀜(2026-09-21, 같은 날)** — 이유는 제품 문서 참고(태국어 등 저자원 언어의
대화체 번역 품질 문제, 캐싱 구조 덕분에 파일럿 규모에서 LLM 비용이 절대금액으로
미미함). **어느 LLM(Claude/GPT/Gemini)을 쓸지는 아직 미정** — 실제 팬-배우 DM
스타일 샘플 문장으로 비교 테스트한 뒤 결정하기로 함. 아래는 그 전에 정리해둔
설계 방향(엔진이 확정되면 이 절을 갱신할 것):

- **연동 방식**: 엔진이 무엇이든 백엔드에는 `translate(text, targetLanguageCode)`
  하나만 노출하는 얇은 래퍼로 감쌀 것 — 나중에 엔진을 교체해도 호출부(메시지/
  CP방/게시글 번역 요청 로직)를 안 건드리게. Claude API를 쓰게 되면 공식
  Anthropic SDK(`@anthropic-ai/sdk`)를 쓸 것(REST 직접 호출 금지 — SDK가 있는데
  fetch로 우회하지 않는다는 이 저장소 컨벤션과 별개로, Claude API 자체가 SDK 사용을
  기본으로 요구함). Google Cloud Translation으로 갈 경우에만 기존 계획대로 REST
  직접 호출(`EmailService`처럼) 검토.
- **신규 서비스**: `backend/src/translation/translation.service.ts` (가칭) —
  `translate(text, targetLanguageCode)` 하나만 노출. IAP/이메일과 마찬가지로 API
  키/서비스 계정 미설정 시 **조용히 무시하지 않고 에러** — 번역은 안전 게이트는
  아니지만, 미설정 상태로 조용히 원문만 내려주면 "번역 버튼을 눌렀는데 그대로"인
  버그처럼 보이므로 명시적 에러가 더 안전.
- **프롬프트(LLM으로 확정될 경우)**: 팬서비스 대화체 톤 유지 지시를 시스템
  프롬프트에 넣을 것 — 딱딱한 직역이 아니라 원문의 다정한 어조를 살리는 게 이번
  엔진 전환의 핵심 이유이므로, 프롬프트 설계 없이 그냥 "번역해줘"만 넣으면 전환한
  의미가 없음.
- **캐싱 흐름 변경 없음**: 기존 `MessageTranslation`(`messageId`+`languageCode` unique)
  스키마 그대로 사용 — 팬이 번역을 요청하면 캐시 조회 → 없으면 `translate()` 호출 후
  upsert. 자동 전체 번역은 하지 않음(비용 절감, 기존 설계 의도 유지).
- **CP방/게시글에도 번역 필요**: `CpMessage`/`ActorPost`/`PostComment`에도 같은 번역
  캐싱이 필요해짐 — `MessageTranslation`처럼 각각 전용 캐시 테이블을 또 만들지,
  아니면 하나의 폴리모픽 번역 캐시 테이블로 통합할지는 미정(CP방/게시글 스펙에서
  이미 남겨둔 `Report` 폴리모피즘 이슈와 같이, 구현 시점에 한 번에 정리할 것).
- **환경변수**: 엔진 확정 후 정할 것 — Claude API면 `ANTHROPIC_API_KEY`, Google Cloud
  Translation이면 `GOOGLE_TRANSLATE_API_KEY`(또는 서비스 계정 JSON) 식. 아직 미추가.

**아직 시작 안 함**: 번역 엔진 자체가 미확정이라 서비스/컨트롤러/환경변수 전부
착수 전. 엔진 비교 테스트(실제 팬-배우 DM 스타일 샘플 문장으로 Claude/GPT/Gemini
번역 품질 비교)부터 먼저 해야 함. 앱 쪽 "번역 보기" 버튼 UI도 아직 없음(현재 채팅
화면에 번역 트리거 자체가 없음 — 확인 필요).

## 데이터 백업/보안 정책 + 보안 하드닝 체크리스트 (2026-09-21, 구현 전)

17개 질문 중 개발 관련 1번(백업/보안)·6번(보안 하드닝)에 대한 답. 대화기록
**보존 기간**(1년) 정책은 별도로 위 "대화기록 보존 기간" 절에 이미 정리돼 있고,
여기는 그것과 별개인 백업/보안 전반.

### 백업

- **DB 백업**: 아직 구현 안 함(CI/CD 미착수와 같은 맥락). 관리형 Postgres(Supabase/
  Neon/Railway 등, 호스팅 미정)를 쓰면 대부분 일 단위 자동 백업을 기본 제공하니,
  호스팅을 정할 때 "자동 백업 포함 여부"를 선택 기준에 넣을 것.
- **권장 보존 기간**: 일 단위 백업 30일 + 주 단위 백업 90일 정도가 이 규모 서비스의
  일반적 기준 — 확정 아니고 호스팅 정할 때 같이 정할 것.
- **복구 훈련**: 최소 분기 1회, 백업에서 실제로 복구가 되는지 테스트 환경에 복원해보는
  절차를 만들 것(지금은 계획만 있고 실행 이력 없음).

### 보안 하드닝 체크리스트

- [x] `ValidationPipe`(`whitelist`/`forbidNonWhitelisted`/`transform`) — 이미 적용됨
  (`backend/src/main.ts`).
- [x] ID 필드는 `@IsUUID()` 대신 `@IsString()+@IsNotEmpty()` — 이미 컨벤션으로 적용 중.
- [x] JWT는 매 요청마다 DB에서 유저 상태 재조회(정지/차단 즉시 반영) — 이미 구현됨.
- [ ] **로그인/인증 엔드포인트 rate limiting** — 아직 없음. 무차별 대입 공격 방지용
  (`@nestjs/throttler` 등 검토).
- [ ] **의존성 취약점 스캔** — `npm audit`이나 GitHub Dependabot 알림 아직 미설정
  (CI/CD 자체가 없어서 같이 미착수).
- [ ] **관리자(ADMIN) 계정 추가 보호** — 지금은 일반 로그인과 동일한 인증 수준.
  민감한 권한(회원 정지/차단, 금칙어 관리)을 고려하면 2단계 인증(TOTP 등) 도입을
  검토할 것.
- [ ] **업로드 파일 검증** — 배우가 올리는 사진/음성/영상의 MIME 타입·용량 제한이
  아직 코드에 없음(업로드 화면 자체도 아직 없어서 같이 미착수).
- [ ] **CORS 허용 목록** — 지금 개발 단계 설정이 프로덕션 기준으로 좁혀졌는지 재점검
  필요.
- [ ] **민감정보 로깅 방지** — JWT 토큰, 비밀번호, 부모 이메일 같은 PII가 에러 로그에
  그대로 찍히지 않는지 점검 필요(Sentry 연동 시 같이 필터링 규칙을 넣을 것).
- [ ] **Sentry(에러 모니터링)** — 여전히 미연동, "젤리 대비 갭" 표에서 가장 시급한
  항목으로 이미 표시돼 있음.

### 개인정보/규제 메모

- 태국 팬 개인정보는 태국 PDPA, 글로벌 팬까지 고려하면 GDPR 유사 조항도 검토
  대상(이미 `business-compliance-checklist.md` 2번 항목에 있음).
- 데이터 유출 시 통지 기한(PDPA/PIPA 공통으로 대략 72시간 내 통지 개념이 있음)에
  맞는 대응 절차(runbook)를 문서화해둘 것 — 지금은 없음.

## 알려진 인프라 이슈

- `backend`의 `npm ci`가 `@nestjs/config@^4.0.4`(peer: `@nestjs/common@^10||^11`)와
  루트 `@nestjs/common@^12.0.1` 버전 충돌로 실패함 — `--legacy-peer-deps`로 우회 설치
  중. 근본 해결(버전 정리)은 아직 안 함.
