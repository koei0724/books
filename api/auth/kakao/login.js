const { buildKakaoAuthorizeUrl } = require("../../../server/kakao");
const { getOrigin, handleApiError, methodNotAllowed, redirect } = require("../../../server/http");
const { createOauthState, setOauthStateCookie } = require("../../../server/session");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    methodNotAllowed(response, ["GET"]);
    return;
  }

  try {
    const state = createOauthState();
    const redirectUri = `${getOrigin(request)}/api/auth/kakao/callback`;
    setOauthStateCookie(request, response, state);
    redirect(response, buildKakaoAuthorizeUrl({ redirectUri, state }));
  } catch (error) {
    handleApiError(response, error, "카카오 로그인 설정이 필요합니다.");
  }
};
