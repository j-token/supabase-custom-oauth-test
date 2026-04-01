-- Send Email Hook 함수
-- OAuth 유저(custom:*)는 이메일 발송 스킵, 이메일 유저는 Resend로 발송
--
-- 사전 준비:
-- 1. pg_net 확장 활성화
-- 2. Supabase Vault에 Resend API Key 등록:
--    INSERT INTO vault.secrets (name, secret) VALUES ('resend_api_key', 'YOUR_RESEND_API_KEY');
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.send_email_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  provider TEXT;
  user_email TEXT;
  action_type TEXT;
  token_hash TEXT;
  redirect_url TEXT;
  site TEXT;
  subject TEXT;
  confirm_url TEXT;
  html_body TEXT;
  resend_key TEXT;
BEGIN
  provider := event->'user'->'app_metadata'->>'provider';

  -- OAuth 유저(custom:*)는 이메일 발송 스킵
  IF provider LIKE 'custom:%' THEN
    RETURN '{}'::JSONB;
  END IF;

  -- Vault에서 Resend API Key 조회
  SELECT decrypted_secret INTO resend_key
    FROM vault.decrypted_secrets
    WHERE name = 'resend_api_key'
    LIMIT 1;

  IF resend_key IS NULL THEN
    RAISE EXCEPTION 'Resend API key not found in vault. See sql/01_send_email_hook.sql for setup.';
  END IF;

  -- 이메일 유저는 Resend API로 확인 이메일 발송
  user_email := event->'user'->>'email';
  action_type := event->'email_data'->>'email_action_type';
  token_hash := event->'email_data'->>'token_hash';
  redirect_url := event->'email_data'->>'redirect_to';
  site := event->'email_data'->>'site_url';

  -- redirect_to 검증: https:// 또는 http://localhost만 허용
  IF redirect_url IS NOT NULL
    AND redirect_url NOT LIKE 'https://%'
    AND redirect_url NOT LIKE 'http://localhost%'
  THEN
    redirect_url := site;
  END IF;

  confirm_url := site || '/auth/v1/verify?token=' || token_hash
    || '&type=' || action_type
    || '&redirect_to=' || redirect_url;

  CASE action_type
    WHEN 'signup' THEN subject := '이메일 주소를 확인해주세요';
    WHEN 'magic_link' THEN subject := '로그인 링크';
    WHEN 'recovery' THEN subject := '비밀번호 재설정';
    WHEN 'email_change' THEN subject := '이메일 변경 확인';
    ELSE subject := '인증 메일';
  END CASE;

  html_body := '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 20px;">'
    || '<h2>' || subject || '</h2>'
    || '<p style="color:#444;line-height:1.6;">아래 버튼을 클릭하여 계속 진행해주세요.</p>'
    || '<a href="' || confirm_url || '" style="display:inline-block;background:#03C75A;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:600;margin:24px 0;">확인하기</a>'
    || '<p style="color:#888;font-size:13px;margin-top:32px;">이 요청을 본인이 하지 않았다면 이 메일을 무시해주세요.</p>'
    || '</div>';

  PERFORM net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || resend_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'from', 'noreply@resend.dev',
      'to', user_email,
      'subject', subject,
      'html', html_body
    )
  );

  RETURN '{}'::JSONB;
END;
$$;

-- 권한 설정: supabase_auth_admin만 실행 가능
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.send_email_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.send_email_hook FROM authenticated, anon, public;
