const { exchangeKakaoCode, fetchKakaoUser } = require("../../../server/kakao");
const { getHomeRedirect, getOrigin, redirect } = require("../../../server/http");
const {
  clearOauthStateCookie,
  readOauthState,
  setSessionCookie,
} = require("../../../server/session");
const { getOrCreateUser } = require("../../../server/supabase");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    redirect(response, getHomeRedirect(request, "?auth_error=method"));
    return;
  }

  try {
    if (request.query.error) {
      redirect(response, getHomeRedirect(request, "?auth_error=cancelled"));
      return;
    }

    const code = String(request.query.code || "");
    const state = String(request.query.state || "");
    if (!code || !state || state !== readOauthState(request)) {
      redirect(response, getHomeRedirect(request, "?auth_error=state"));
      return;
    }

    const redirectUri = `${getOrigin(request)}/api/auth/kakao/callback`;
    const accessToken = await exchangeKakaoCode({ code, redirectUri }).catch(() => "");
    if (!accessToken) {
      redirect(response, getHomeRedirect(request, "?auth_error=token"));
      return;
    }

    const kakaoUser = await fetchKakaoUser(accessToken).catch(() => null);
    if (!kakaoUser?.kakaoId) {
      redirect(response, getHomeRedirect(request, "?auth_error=user"));
      return;
    }

    await getOrCreateUser(kakaoUser).catch(() => null);

    clearOauthStateCookie(request, response);
    try {
      setSessionCookie(request, response, kakaoUser);
    } catch (error) {
      redirect(response, getHomeRedirect(request, "?auth_error=session"));
      return;
    }

    redirect(response, getHomeRedirect(request));
  } catch (error) {
    clearOauthStateCookie(request, response);
    redirect(response, getHomeRedirect(request, "?auth_error=server"));
  }
};
