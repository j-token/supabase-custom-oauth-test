# Supabase Custom OAuth - 네이버 로그인 샘플

Supabase의 [Custom OAuth Provider](https://supabase.com/docs/guides/auth/custom-oauth-providers) 기능을 사용하여 네이버 OAuth 로그인을 구현한 샘플 프로젝트입니다.

## 구조

```
├── index.html                          # 메인 페이지 (로그인/유저 정보)
├── auth-callback.html                  # OAuth 콜백 처리
├── setup-guide.html                    # 설정 가이드 페이지
├── server.js                           # Node.js 정적 파일 서버
├── package.json
├── .env.example                        # 환경변수 템플릿
├── sql/
│   ├── 01_send_email_hook.sql          # Send Email Hook (OAuth 스킵 + Resend 발송)
│   └── 02_auto_confirm_oauth.sql       # OAuth 유저 이메일 자동 인증 트리거
└── supabase/functions/
    ├── naver-userinfo-proxy/index.ts   # 네이버 API 응답 평탄화 프록시
    └── send-email/index.ts             # Send Email Hook (Edge Function 버전)
```

## 사전 요구사항

- [Node.js](https://nodejs.org/) 18+
- [Supabase](https://supabase.com/) 프로젝트
- [네이버 개발자 센터](https://developers.naver.com/) 앱
- [Resend](https://resend.com/) 계정 (이메일 발송용, 무료)

## 설정

### 1. 환경변수

```bash
cp .env.example .env
```

`.env` 파일에 값을 입력합니다:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-key
RESEND_API_KEY=re_your_resend_api_key
```

### 2. 네이버 개발자 센터

1. [네이버 개발자 센터](https://developers.naver.com/apps/)에서 앱 등록
2. 사용 API: `네이버 로그인` 선택
3. 필수 권한: 회원이름, 이메일
4. Callback URL 설정:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```

### 3. Supabase 설정

#### Custom OAuth Provider 등록

대시보드 > **Authentication > Providers > New Provider > Manual configuration**

| 항목 | 값 |
|---|---|
| Identifier | `custom:naver-test` |
| Authorization URL | `https://nid.naver.com/oauth2.0/authorize` |
| Token URL | `https://nid.naver.com/oauth2.0/token` |
| UserInfo URL | `https://<project-ref>.supabase.co/functions/v1/naver-userinfo-proxy` |

> **NOTE**: UserInfo URL은 네이버 API 직접 URL이 아닌 **Edge Function 프록시**를 사용합니다.
> 네이버 API 응답이 중첩 구조(`{ response: { ... } }`)이기 때문에
> 평탄화 프록시가 필요합니다.

#### Redirect URL 허용

대시보드 > **Authentication > URL Configuration**에 추가:

```
http://localhost:3000/auth-callback.html
```

#### Edge Function 배포

```bash
# 네이버 userinfo 프록시
npx supabase functions deploy naver-userinfo-proxy --no-verify-jwt --project-ref <your-ref>

# Send Email Hook 함수
npx supabase functions deploy send-email --no-verify-jwt --project-ref <your-ref>
```

#### Send Email Hook 설정

이메일 로그인(확인 이메일 발송)과 OAuth 로그인(확인 이메일 스킵)을 동시에 지원하려면 Send Email Hook 설정이 필요합니다.

OAuth만 사용하고 이메일 로그인이 필요 없다면 이 단계를 건너뛰고, 대시보드에서 **Confirm email** 옵션을 비활성화하세요.

##### 1. Edge Function 시크릿 등록

```bash
npx supabase secrets set RESEND_API_KEY=YOUR_RESEND_API_KEY --project-ref <your-ref>
```

##### 2. OAuth 유저 이메일 자동 인증 트리거

SQL Editor에서 실행:

- `sql/02_auto_confirm_oauth.sql` — OAuth 유저 이메일 자동 인증 트리거

##### 3. Send Email Hook 등록

대시보드 > **Authentication > Hooks** > **Add Send Email hook**

| 설정 | 값 |
|---|---|
| Hook type | **HTTPS** |
| URL | `https://<your-ref>.supabase.co/functions/v1/send-email` |
| Secret | **Generate Secret** 클릭 후 복사 |

**Create hook**을 클릭합니다.

생성된 시크릿을 Edge Function에 등록:

```bash
npx supabase secrets set SEND_EMAIL_HOOK_SECRET="생성된_시크릿" --project-ref <your-ref>
```

> **NOTE**: Postgres 타입 훅을 사용할 수도 있습니다.
> `sql/01_send_email_hook.sql`에 동일한 로직의 Postgres 함수 버전이 포함되어 있습니다.
> 이 경우 Supabase Vault에 Resend API Key를 등록하고, Hook type을 Postgres로 선택하세요.

## 실행

```bash
npm start
# http://localhost:3000
```

## 아키텍처

```
사용자 → [index.html] → Supabase Auth → 네이버 로그인
                                            ↓
사용자 ← [auth-callback.html] ← Supabase Auth ← 네이버 콜백
                                            ↓
                              [naver-userinfo-proxy]
                              네이버 API 호출 → 응답 평탄화 → Supabase에 반환
```

### 왜 프록시가 필요한가?

네이버 프로필 API(`/v1/nid/me`)는 데이터를 `response` 객체 안에 중첩하여 반환합니다:

```json
{ "resultcode": "00", "response": { "email": "user@naver.com", "name": "홍길동" } }
```

Supabase Auth는 최상위 레벨에서 `email`, `name` 등을 파싱하므로, 중첩 구조를 평탄화하는 프록시가 필요합니다.

### Send Email Hook 동작

| 로그인 방식 | 확인 이메일 | 이메일 인증 |
|---|---|---|
| 이메일/비밀번호 | Resend로 발송 | 링크 클릭 시 인증 |
| 네이버 OAuth | 발송 안 함 | DB 트리거로 자동 인증 |

## 보안 참고사항

- **API 키를 소스코드에 커밋하지 마세요.** `.env` 파일은 `.gitignore`에 포함되어 있습니다.
- **Supabase Publishable Key**(`sb_publishable_...`)는 공개 키이지만, 프로젝트 URL 노출을 최소화하는 것이 좋습니다.
- **Resend API Key**는 SQL 함수에 하드코딩하지 마세요.
- **Edge Function**의 `verify_jwt: false` 설정은 의도적입니다. Supabase Auth 서버가 네이버 access token으로 호출하기 때문입니다.
- `server.js`는 Path Traversal 방어와 `.env` 파일 접근 차단이 적용되어 있습니다.

## 라이선스

MIT
