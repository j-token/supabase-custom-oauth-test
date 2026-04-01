-- OAuth 유저(custom:*) 이메일 자동 인증 트리거
-- auth.users에 INSERT 시 provider가 custom:*이면 email_confirmed_at을 자동 설정
CREATE OR REPLACE FUNCTION public.auto_confirm_oauth_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $trigger$
BEGIN
  IF NEW.raw_app_meta_data->>'provider' LIKE 'custom:%' THEN
    NEW.email_confirmed_at = NOW();
  END IF;
  RETURN NEW;
END;
$trigger$;

DROP TRIGGER IF EXISTS on_oauth_user_auto_confirm ON auth.users;

CREATE TRIGGER on_oauth_user_auto_confirm
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_confirm_oauth_email();
