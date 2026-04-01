import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") as string;
const HOOK_SECRET = Deno.env.get("SEND_EMAIL_HOOK_SECRET") as string;

interface SendEmailPayload {
  user: {
    email: string;
    app_metadata: {
      provider?: string;
      providers?: string[];
    };
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
    token_new?: string;
    token_hash_new?: string;
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Webhook 서명 검증
  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);
  const wh = new Webhook(HOOK_SECRET);

  let data: SendEmailPayload;
  try {
    data = wh.verify(payload, headers) as SendEmailPayload;
  } catch {
    return new Response("Invalid signature", { status: 401 });
  }

  const { user, email_data } = data;
  const provider = user.app_metadata?.provider || "";

  // OAuth 유저(custom:* 프로바이더)는 이메일 발송 스킵
  if (provider.startsWith("custom:")) {
    return new Response(JSON.stringify({}), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // 이메일 유저는 Resend로 확인 이메일 발송
  const { email_action_type, token_hash, redirect_to, site_url } = email_data;

  // redirect_to 검증: https:// 또는 http://localhost만 허용
  const safeRedirect =
    redirect_to &&
    (redirect_to.startsWith("https://") || redirect_to.startsWith("http://localhost"))
      ? redirect_to
      : site_url;

  const confirmUrl = `${site_url}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${encodeURIComponent(safeRedirect)}`;

  const subjectMap: Record<string, string> = {
    signup: "이메일 주소를 확인해주세요",
    magic_link: "로그인 링크",
    email_change: "이메일 변경 확인",
    recovery: "비밀번호 재설정",
  };

  const subject = subjectMap[email_action_type] || "인증 메일";

  const htmlBody = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
      <h2 style="color: #1a1a1a; margin-bottom: 16px;">${subject}</h2>
      <p style="color: #444; line-height: 1.6;">아래 버튼을 클릭하여 ${email_action_type === "signup" ? "이메일 주소를 인증" : "계속 진행"}해주세요.</p>
      <a href="${confirmUrl}"
         style="display: inline-block; background: #03C75A; color: #fff; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 24px 0;">
        ${email_action_type === "signup" ? "이메일 인증하기" : "확인하기"}
      </a>
      <p style="color: #888; font-size: 13px; margin-top: 32px;">이 요청을 본인이 하지 않았다면 이 메일을 무시해주세요.</p>
    </div>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "noreply@resend.dev",
      to: user.email,
      subject,
      html: htmlBody,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    console.error("Resend API error:", error);
    return new Response(JSON.stringify({ error }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({}), {
    headers: { "Content-Type": "application/json" },
  });
});
