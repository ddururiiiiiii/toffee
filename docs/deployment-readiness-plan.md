# 토피 배포 준비 로드맵 / 논의 이력

젤리(gelly)의 `docs/deployment-readiness-plan.md` 관례를 따라, 토피에서도 세션마다
논의·정정 사항을 날짜순으로 기록한다.

## 참고 — 진행 중 밝혀진 정정 사항

- (아직 없음. 이후 세션에서 버그·정정 사항 발견 시 이 목록에 날짜와 함께 추가할 것.)

---

## 2026-09-18 — 인프라/설계 방향 검토, 젤리 대비 아키텍처 비교, 창업지원금 리서치

### 배경

토피는 젤리의 설계 패턴을 참고해 시작했지만, 실제 상업 서비스(태국 배우 팬덤 DM 플랫폼,
Bubble 구조 + Weverse 기능 벤치마킹, 전 세계 팬 대상 다국어 지원)를 목표로 하면서
아래 4가지를 점검했다.

### 1. 젤리 대비 아키텍처 비교 — 우선순위 갭 5가지

코드 기준 비교 결과, 백엔드 검증 컨벤션(ID 필드 검증 방식, `ValidationPipe`
`whitelist/forbidNonWhitelisted/transform` 설정, `@Public()` + 글로벌 가드 순서)은
`backend/src/reports/dto/create-report.dto.ts`, `backend/src/app.module.ts`,
`backend/src/main.ts` 등에 코드 레벨로는 이미 계승되어 있다. 반면 아래 5가지는
아직 전혀 갖춰지지 않았고, 상업 운영을 목표로 한다면 우선순위가 높다.

1. **앱 dev/prod 빌드 분리 부재**
   - 젤리는 `app/app.config.ts`가 `APP_VARIANT` 환경변수로 앱 이름/번들ID/scheme/
     GoogleService 파일/네이버·카카오 키를 dev·prod로 분기하고, `app/eas.json`에
     development/preview/production 3개 빌드 프로필이 구성돼 있다.
   - 토피는 `app/app.json`(정적 JSON, `app.config.ts` 아님)만 있고 `eas.json` 자체가
     없다 — 빌드 분리 전략이 전무한 상태. `app/.env.example`도 `EXPO_PUBLIC_API_URL`
     한 줄뿐(소셜로그인/Sentry 등 변수 자체가 아직 없음).
   - `backend/.env.example`의 `ENABLE_DEV_LOGIN` 기본값도 토피는 `"true"`
     (젤리는 `"false"`) — 가드 로직(`NODE_ENV !== production`에서만 동작) 자체는
     안전하지만, 기본값이 실수로 prod에 그대로 나갈 위험을 조금 더 열어둔다.
   - Supabase pooler를 쓸 계획이라면 젤리처럼 `DIRECT_URL`(CLI 마이그레이션 전용
     direct 커넥션)을 분리해둘 필요도 있다 — 토피 `.env.example`엔 아직 없음.

2. **에러 모니터링 전무 (가장 시급)**
   - 젤리는 백엔드(`backend/src/instrument.ts`, `main.ts` 최상단 import)와 앱
     (`app/app.config.ts`의 `@sentry/react-native/expo` 플러그인) 양쪽에 Sentry가
     이미 붙어 있다.
   - 토피는 backend/app 전체에서 Sentry 관련 코드가 0건 — "상업 운영이라 장애
     대응이 체계적이어야 한다"는 목표와 정면으로 배치되는 갭.
   - 추가로 `helmet()`, `trust proxy` 설정도 젤리 `main.ts`엔 있지만 토피엔 빠져 있음.

3. **CI/CD·자동 백업 부재**
   - 젤리는 `.github/workflows/`에 lint/build/typecheck CI, iOS/Android EAS 빌드,
     OTA 업데이트, 매일 DB 덤프 백업(Supabase Storage) 등 5개 워크플로우가 있다.
   - 토피는 `.github` 디렉토리 자체가 없음 — CI, 자동 빌드, 자동 백업 전부 없음.

4. **헬스체크가 단순함**
   - 토피 `backend/src/app.controller.ts`의 `/health`는 `{status:'ok'}`만 반환.
   - 젤리는 `/health`(DB 체크 포함) + `/health/live`(프로세스 응답 여부만 확인하는
     liveness, orchestrator용)로 분리돼 있어 더 정교하다.

5. **문서화·다국어 콘텐츠 확장 미비**
   - 토피 루트에 `CLAUDE.md`가 없고, `backend/README.md`/`app/README.md`는 각각
     Nest/Expo 기본 템플릿 그대로라 컨벤션 문서화가 전혀 안 되어 있다.
   - 다국어: `MessageTranslation` 모델(원문 1회 저장 + 언어별 lazy 캐싱 번역 테이블
     패턴)은 이미 잘 설계돼 있으나, `Actor.legalName`/`chatDisplayName` 등 배우
     프로필·시스템 메시지 같은 정적 콘텐츠의 다국어 저장 구조는 아직 없고, 앱
     UI 자체의 i18n 라이브러리(react-i18next 등)도 아직 도입 전.
   - 참고: 개발 로드맵 아티팩트(https://claude.ai/artifact/2SSV2exLhYfW7zx7jsZP5o)의
     "8단계 진행 중" 항목이 바로 이 번역 파이프라인이며, 태국어+영어부터 지원 예정.

### 2. dev/prod DB·앱 분리 관련 결론

- DB는 이미 `DATABASE_URL` 단일 변수 교체 방식으로 dev/prod 분리가 가능한 구조(젤리와
  동일). Supabase pooler를 쓴다면 `DIRECT_URL` 분리를 미리 넣어두는 게 안전.
- 앱은 위 1번 갭대로 `app.config.ts` + `eas.json` 멀티 프로필 체계를 젤리에서
  그대로 가져와 초기에 세팅해두는 게 좋다 — 나중에 붙이면 번들ID/스킴 변경 등
  마이그레이션 비용이 커짐.

### 3. 창업지원금·법률 관련 리서치 (참고용, 실제 신청 전 각 기관에 직접 확인 필요)

- **K-Startup(창업진흥원)**: 초기창업패키지 등 창업 3년 이내 기업 대상 사업화자금
  (일반형 최대 1억원)이 있으나, 검색 결과상 "태국 파트너 협업"에 특화된 별도
  트랙은 확인되지 않음. K-Startup 포털(www.k-startup.go.kr)에서 연중 공고 확인 필요.
- **KOTRA / 주태국 대한민국 대사관**: 스타트업 해외진출 지원 사업, 수출지원기반활용사업
  (바우처) 등 태국 진출 관련 지원 프로그램을 운영. 대사관 기업지원헬프데스크를 통해
  현지 법인 설립·계약 관련 실무 자문을 받을 수 있는 창구가 있음.
- **한국콘텐츠진흥원(콘진원)**: K-콘텐츠 해외 진출·IP 투자 연계 지원사업을 운영하며,
  최근 IP·팬덤 기반 비즈니스를 전략적으로 지원하는 방향으로 전환 중 — 토피처럼
  "아티스트 IP + 팬덤 구독"이 코어인 서비스는 이 카테고리로 접근할 여지가 있음.
- **ASEAN-Korea Cooperation Fund(AKCF)**: 한-아세안 협력기금으로 스타트업/디지털
  혁신 관련 트랙(KADIF 등)이 있으나 개별 스타트업이 직접 신청하는 구조라기보다
  정부-정부 간 프로젝트 성격이 강함 — 직접 지원금보다는 생태계/네트워킹 관점으로
  참고.
- 태국 배우/기업과의 협업 계약 구조(수익 배분, 초상권/IP 사용권 등)는 지원사업과
  별개로 한국 변호사 + 태국 현지 로펌 양쪽 법률 자문이 필요한 영역 — 이 리서치는
  지원사업 존재 여부 확인까지이며, 실제 계약서 검토는 별도로 진행 필요.

### 4. 남은 일 / 다음 액션

- [ ] 사업 로드맵 아티팩트(`EDRpSJv6qkY51xUYqSfJYg`) 접근 권한 문제 해결 후 재검토
      (공유 목록에 없어 이번 세션에서 읽지 못함)
- [ ] `app/app.config.ts` + `eas.json` 멀티 프로필 체계 도입 (젤리 패턴 이식)
- [ ] 백엔드/앱 Sentry 연동
- [ ] `.github/workflows/` CI(lint/build/typecheck) 최소 구성
- [ ] `Actor` 다국어 필드 또는 `ActorTranslation` 테이블 설계 + 앱 i18n 라이브러리 도입
- [ ] 루트 `CLAUDE.md` 작성, `backend/README.md`/`app/README.md` 컨벤션 문서화
- [ ] K-Startup/콘진원 공고 상시 모니터링, KOTRA 태국 진출 지원사업 신청 요건 확인
