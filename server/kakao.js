const { getKakaoClientSecret, getKakaoRestApiKey, requireConfig } = require("./config");

const KAKAO_AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize";
const KAKAO_TOKEN_URL = "https://kauth.kakao.com/oauth/token";
const KAKAO_USER_URL = "https://kapi.kakao.com/v2/user/me";

function buildKakaoAuthorizeUrl({ redirectUri, state }) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: requireConfig("KAKAO_REST_API_KEY", getKakaoRestApiKey()),
    redirect_uri: redirectUri,
    state,
  });

  return `${KAKAO_AUTHORIZE_URL}?${params}`;
}

async function exchangeKakaoCode({ code, redirectUri }) {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: requireConfig("KAKAO_REST_API_KEY", getKakaoRestApiKey()),
    redirect_uri: redirectUri,
    code,
  });
  const clientSecret = getKakaoClientSecret();
  if (clientSecret) params.set("client_secret", clientSecret);

  const response = await fetch(KAKAO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body: params,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.access_token) {
    const error = new Error("Kakao token request failed");
    error.statusCode = 502;
    error.publicMessage = "카카오 로그인 토큰을 받지 못했습니다.";
    throw error;
  }

  return data.access_token;
}

async function fetchKakaoUser(accessToken) {
  const response = await fetch(KAKAO_USER_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.id) {
    const error = new Error("Kakao user request failed");
    error.statusCode = 502;
    error.publicMessage = "카카오 사용자 정보를 가져오지 못했습니다.";
    throw error;
  }

  return {
    kakaoId: String(data.id),
    nickname:
      data.kakao_account?.profile?.nickname ||
      data.properties?.nickname ||
      "",
  };
}

module.exports = {
  buildKakaoAuthorizeUrl,
  exchangeKakaoCode,
  fetchKakaoUser,
};
