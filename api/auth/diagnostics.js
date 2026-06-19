const {
  getKakaoClientSecret,
  getKakaoRestApiKey,
  getSessionSecret,
  getSupabaseSecretKey,
  getSupabaseUrl,
} = require("../../server/config");
const { json, methodNotAllowed } = require("../../server/http");
const { readSession } = require("../../server/session");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    methodNotAllowed(response, ["GET"]);
    return;
  }

  const cookieHeader = String(request.headers.cookie || "");
  const session = readSession(request);

  json(response, 200, {
    authenticated: Boolean(session),
    sessionCookiePresent: cookieHeader.includes("reading_shelf_session="),
    oauthCookiePresent: cookieHeader.includes("reading_shelf_oauth_state="),
    env: {
      kakaoRestApiKey: Boolean(getKakaoRestApiKey()),
      kakaoClientSecret: Boolean(getKakaoClientSecret()),
      sessionSecret: Boolean(getSessionSecret()),
      supabaseUrl: Boolean(getSupabaseUrl()),
      supabaseSecretKey: Boolean(getSupabaseSecretKey()),
    },
  });
};
