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

## 알려진 인프라 이슈

- `backend`의 `npm ci`가 `@nestjs/config@^4.0.4`(peer: `@nestjs/common@^10||^11`)와
  루트 `@nestjs/common@^12.0.1` 버전 충돌로 실패함 — `--legacy-peer-deps`로 우회 설치
  중. 근본 해결(버전 정리)은 아직 안 함.
