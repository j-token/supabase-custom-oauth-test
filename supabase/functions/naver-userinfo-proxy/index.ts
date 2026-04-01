import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * 네이버 userinfo 프록시
 *
 * 네이버 API의 중첩 응답을 Supabase Auth가 파싱 가능한 평탄한 구조로 변환합니다.
 *
 * 네이버 원본 응답:
 * { "resultcode": "00", "message": "success", "response": { "id": "...", "email": "..." } }
 *
 * 변환 후 응답:
 * { "sub": "...", "email": "...", "name": "...", "picture": "..." }
 */
Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Missing Authorization header" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // 네이버 프로필 API 호출
  const naverRes = await fetch("https://openapi.naver.com/v1/nid/me", {
    headers: { Authorization: authHeader },
  });

  if (!naverRes.ok) {
    return new Response(
      JSON.stringify({ error: "Naver API request failed" }),
      { status: naverRes.status, headers: { "Content-Type": "application/json" } },
    );
  }

  const data = await naverRes.json();

  if (data.resultcode !== "00" || !data.response) {
    return new Response(
      JSON.stringify({ error: "Naver API returned error", detail: data.message }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const profile = data.response;

  // OIDC 표준 클레임 필드명에 맞춰 평탄화
  const claims = {
    sub: profile.id,
    email: profile.email || "",
    name: profile.name || "",
    nickname: profile.nickname || "",
    picture: profile.profile_image || "",
    age: profile.age || "",
    gender: profile.gender || "",
    birthday: profile.birthday || "",
    birthyear: profile.birthyear || "",
    mobile: profile.mobile || "",
  };

  return new Response(JSON.stringify(claims), {
    headers: {
      "Content-Type": "application/json",
      Connection: "keep-alive",
    },
  });
});
