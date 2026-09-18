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

## 배우 본인 계정 (`Role.ACTOR`) — 설계, 아직 미구현

메시지·스토리를 배우 본인만 보낼 수 있게 되면서, 지금 `Role`(`USER`/`AGENCY_STAFF`/`ADMIN`)에
배우 본인 계정 개념이 없다는 게 드러남. 확정된 설계:

- `Role.ACTOR` 추가, `Actor.selfUserId`(1:1, 배우 본인 계정) 필드 신설.
- `ensureStaffOfActor()`(소속사 스태프 검증)와 별개로 `ensureIsActorSelf(userId, actorId)`
  신규 구현.
- `POST /actors/:id/messages/broadcast`의 `@Roles(AGENCY_STAFF, ADMIN)`을
  `ensureIsActorSelf` 체크로 교체 (소속사 발송 권한 제거 반영).
- 배우 전용 업로드/작성 화면(카메라 촬영 → 즉시 업로드, 메시지 작성)을 어디에 둘지는
  미정 — 팬 앱과도 소속사 콘솔과도 다른 진입점이 필요.

## `Story`/`StoryView` 모델 — 설계, 아직 미구현

```prisma
model Story {
  id         String   @id @default(uuid())
  actorId    String
  mediaType  MessageMediaType   // 기존 enum 재사용
  mediaUrl   String
  createdAt  DateTime @default(now())
  expiresAt  DateTime           // createdAt + 24h
  views      StoryView[]
}

model StoryView {
  id        String   @id @default(uuid())
  storyId   String
  fanUserId String
  viewedAt  DateTime @default(now())
  @@unique([storyId, fanUserId])
}
```

- 조회는 `expiresAt > now()`인 것만 반환, 만료분은 별도 cron이 레코드+스토리지 파일 정리.
- 구독자 전용 — 메시지 조회와 동일하게 활성 구독 체크 선행.
- 업로드 주체는 `ensureIsActorSelf` 권한 체크 (위 참고).

## 소속사 모니터링 기능 — 설계, 아직 미구현

소속사가 배우가 보낸 메시지를 팬 화면과 동일하게 읽기 전용으로 볼 수 있어야 함.

- `GET /actors/:id/messages`(팬용 전체 대화 조회)를 `AGENCY_STAFF`도 읽기 전용으로 접근
  가능하게 확장 검토. 지금 있는 `GET /actors/:id/messages/replies`는 팬 답장만 보여주고
  배우가 보낸 본문 자체는 안 보여줘서 이 요구를 못 채움.
- 배우가 메시지/스토리를 보낼 때 담당 소속사 스태프에게 FCM 푸시 발송 필요(신규).
- 팬 개인정보 노출 범위 검토 필요 — 답장 조회 API가 노출하는 "팬 이름"이 닉네임인지
  실명인지 아직 미확인, 노출 범위에 따라 태국 PDPA 이슈 가능.

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
