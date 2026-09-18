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

**아직 안 한 것**:
- 만료 스토리 정리 cron — 레코드 삭제 + 스토리지 파일 삭제. `@nestjs/schedule`
  같은 스케줄러 자체가 아직 의존성에 없음, 실제 스토리지 프로바이더(Supabase
  Storage 등)도 아직 코드에 연동 안 됨.
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

## 콘텐츠 모더레이션 / 회원 관리 — 조사 완료, 설계 전

2026-09-18 조사 결과, 아래는 전부 **없음**:

- 욕설/음란어 등 텍스트 필터링 로직 — `messages.service.ts`의 `sendReply()`는 아무 검사
  없이 `dto.body`를 그대로 저장. 금칙어 사전이나 필터 모델도 없음.
- `User` 모델에 정지/차단 관련 필드 (`banned`, `suspended`, `status` 등) 없음.
- 관리자용 유저 목록 조회, 정지/차단 엔드포인트(`users`/`admin` 모듈 자체가 없음) 없음.
- 배우가 특정 팬을 차단하는 관계(예: `Actor.blockedFans`) 없음.

지금 "모더레이션 큐"라고 부를 만한 건 `reports` 모듈(팬이 신고 → ADMIN이 승인/기각)
하나뿐이고, 신고 처리 시 메시지 삭제나 유저 제재 같은 부수 효과는 없음(상태값만 바뀜).

### 결정된 스펙 (2026-09-18, 제품 결정은 `docs/product/feature-decisions.md` 참고)

- 팬 답장에 금칙어가 있으면 **전송 자체를 차단**(마스킹 아님) — 서버에서 저장 전에 검사.
- 금칙어 목록은 **ko/th/en** 3개 언어로 관리.
- 팬 계정 제재는 **일시정지 / 영구차단** 2단계.

### 스키마 설계안 (아직 미구현)

```prisma
model BannedWord {
  id        String   @id @default(uuid())
  term      String
  language  String   // 'ko' | 'th' | 'en'
  createdAt DateTime @default(now())
  @@unique([term, language])
}

enum UserStatus {
  ACTIVE
  SUSPENDED
  BANNED
}
```

`User`에 `status UserStatus @default(ACTIVE)`, `suspendedUntil DateTime?`,
`bannedAt DateTime?` 추가.

### 구현 지점

- `messages.service.ts`의 `sendReply()` — 저장 전에 `dto.body`를 `BannedWord` 목록과
  대조(대소문자 무시, 부분 문자열 매치)해서 걸리면 400으로 거부. 팬이 어떤 언어로
  쓰든 3개 언어 목록 전체와 대조(언어 감지 없이 그냥 전체 매치).
- 전역 인증 가드(`JwtAuthGuard`) 또는 별도 인터셉터에서 `User.status`가 `SUSPENDED`/
  `BANNED`면 요청 자체를 거부하도록 추가.
- 신규 `admin`(또는 `users`) 모듈 필요: 금칙어 CRUD(`GET/POST/DELETE /admin/banned-words`),
  유저 목록 조회 및 정지/차단(`GET /admin/users`, `PATCH /admin/users/:id/suspend`,
  `PATCH /admin/users/:id/ban`) — 전부 `@Roles(Role.ADMIN)`.

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

## 알려진 인프라 이슈

- `backend`의 `npm ci`가 `@nestjs/config@^4.0.4`(peer: `@nestjs/common@^10||^11`)와
  루트 `@nestjs/common@^12.0.1` 버전 충돌로 실패함 — `--legacy-peer-deps`로 우회 설치
  중. 근본 해결(버전 정리)은 아직 안 함.
