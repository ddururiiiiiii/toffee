# 실기기 테스트 빌드 (iOS, EAS 내부 배포)

2026-10-02 작성. 아이폰에 "Toffee Dev" 앱을 깔아서 웹에서 못 해 본 것(푸시, 카메라·녹음, 제스처, 영상 썸네일, 화면 꺼도 음성
재생, 소셜 로그인 SDK)을 확인하는 절차. 빌드는 Expo 클라우드(EAS)에서 돌아서 **맥·윈도우 어느 쪽에서 해도 된다**(Xcode 불필요).

## 어떤 빌드인가

- 프로필 `preview`(`app/eas.json`) — 개발용 번들 ID `com.toffeechat.app.dev`(앱 이름 "Toffee Dev"), 데모 서버
  `https://api-demo.toffeechat.app`에 붙고, 입장 코드 로그인이 보임(`EXPO_PUBLIC_ENABLE_DEV_LOGIN=true`). 개발 서버(Metro) 없이 혼자 실행됨.
- 배포 방식: **내부 배포(ad hoc)** — 등록한 기기에만 링크로 설치. App Store Connect에 앱을 만들 필요 없음. 테스트하는 사람이 늘거나 인앱 결제
  샌드박스를 확인할 때 TestFlight로 넘어간다(그땐 App Store Connect에 `.dev` 앱 등록 필요).
- 애플 계정: 기존 개인 개발자 계정(젤리 공용, Team ID `SUA3AJW6KF`). 운영 번들 ID는 여기 등록하지 않는다(`ops-infra-backlog.md` 1번).
- Sentry 소스맵 업로드는 `SENTRY_DISABLE_AUTO_UPLOAD=true`로 꺼 둠(`SENTRY_AUTH_TOKEN`을 EAS 비밀 변수에 넣으면 이 줄을 지울 것).

## 0. 준비 (처음 한 번)

```bash
npm install -g eas-cli          # 18.1 이상
git clone https://github.com/toffeechat/toffee.git && cd toffee/app
npm ci
eas login                       # 토피 Expo 계정(toffeechat-team 조직 멤버)
eas whoami
```

## 1. 네이버 Secret을 EAS 변수로

expo.dev → `toffeechat-team/toffee` → **Environment variables** → Add:
이름 `EXPO_PUBLIC_NAVER_CONSUMER_SECRET_DEV`, 값 = 네이버 개발자센터 Toffee 앱의 Client Secret, 환경 **preview·development** 체크,
Visibility **Sensitive**. (없으면 앱에서 네이버 버튼만 안 보이고 나머지는 동작.)

## 2. 아이폰 등록

```bash
eas device:create               # "Website" 선택 → 나온 QR/주소를 아이폰 Safari로 열기
```

아이폰에서 프로파일 다운로드 → 설정 앱 위쪽 "프로파일이 다운로드됨" → 설치. 끝나면 `eas device:list`에 보임.

## 3. 푸시 준비 (빌드 전에 해 두면 설치하자마자 확인 가능)

1. **APNs 키**: developer.apple.com → Certificates, IDs & Profiles → **Keys** → + → "Apple Push Notifications service (APNs)" 체크 →
   .p8 다운로드(**한 번만 받을 수 있음** — 안전한 곳에 보관, 저장소엔 넣지 않음). Key ID 메모. 팀당 APNs 키는 2개까지라, 젤리가 쓰는 APNs
   키의 .p8을 갖고 있으면 그걸 써도 된다(키는 팀 전체 앱에 공통).
2. **Firebase**: 콘솔 → `toffee-c6cba` → 프로젝트 설정 → 클라우드 메시징 → Apple 앱 구성(`com.toffeechat.app.dev`) → APNs 인증 키 업로드
   (.p8, Key ID, Team ID `SUA3AJW6KF`).
3. **서버**: Firebase 프로젝트 설정 → 서비스 계정 → "새 비공개 키 생성" → 받은 JSON 내용을 Railway `toffee-demo` 서비스 변수
   `FIREBASE_SERVICE_ACCOUNT_JSON`에 통째로 붙여넣기(저장하면 재배포). JSON 파일은 저장소·대화에 올리지 않는다.

## 4. 빌드

```bash
eas build --platform ios --profile preview
```

질문이 나오면:

| 질문 | 답 |
|---|---|
| Log in to your Apple account? | Yes → 개인 개발자 Apple ID + 2단계 인증 코드 |
| Generate a new Apple Distribution Certificate? | Yes. **"한도 초과라 기존 인증서를 revoke할까"가 나오면 No** 하고 멈출 것 — 젤리 인증서일 수 있음 |
| 프로비저닝 프로파일에 넣을 기기 | 2단계에서 등록한 아이폰 선택 |
| Set up Push Notifications / Apple Push key 생성? | **No** — 토피는 Expo 푸시가 아니라 Firebase(FCM)로 보내고, 3단계 키를 Firebase에 넣었음 |

클라우드 빌드 15~30분. 끝나면 빌드 페이지 주소·QR이 나온다(무료 요금제는 대기열이 있을 수 있음).

## 5. 설치

1. 아이폰 카메라로 빌드 QR → **Install**.
2. 처음이면 **설정 → 개인정보 보호 및 보안 → 개발자 모드 켜기**(재시작 후 "켜기" 확인) — iOS 16부터 내부 배포 앱은 이게 켜져 있어야 열림.
3. 앱 실행 → 로그인(입장 코드 또는 소셜 로그인) → 알림 허용.

## 6. 확인할 것

- 로그인: 애플·구글·카카오(카카오톡 앱 있으면 앱으로 갔다 돌아오는지)·네이버·LINE, 입장 코드
- 푸시: 아티스트 계정(웹 데모 `demo.toffeechat.app`)으로 메시지 보내기 → 폰에 알림, 누르면 그 대화방
- 카메라 촬영·사진 선택·음성 녹음 보내기(아티스트 계정), 영상 썸네일
- 사진 확대·넘기기·끌어서 닫기, 저장(사진 앱)
- 음성: 무음 모드·화면 꺼도 재생, 다음 음성 이어 듣기
- 결과는 `STATUS.md`의 "실기기 확인 남음" 줄들에 반영

## 문제가 생기면

- 앱이 바로 꺼짐 → Sentry `toffee-app`(preview 빌드는 DSN 들어 있음)
- 소셜 로그인만 실패 → 각 콘솔의 iOS 번들 ID `com.toffeechat.app.dev`, URL scheme(네이버 `toffeenaverdev`) 확인
- 푸시 안 옴 → Railway 로그에서 Firebase 초기화 메시지, Firebase에 APNs 키가 올라갔는지
- 코드만 바꾼 뒤 다시 깔려면 4·5단계만 반복(기기·인증서는 재사용). 새 기기를 추가했으면 `eas device:create` 후 다시 빌드해야 그 기기에 깔림.

## 안드로이드 (나중에 — 지금 테스트 기기 없음)

`eas build -p android --profile preview` → APK. 그 뒤 `eas credentials`에서 서명 SHA-1을 확인해 구글 안드로이드 OAuth 클라이언트,
카카오 키 해시, 네이버·LINE 안드로이드 앱(패키지 `com.toffeechat.app.dev`)에 등록해야 소셜 로그인이 된다.
