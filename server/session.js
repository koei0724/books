const crypto = require("crypto");
const { getSessionSecret, requireConfig } = require("./config");

const SESSION_COOKIE = "reading_shelf_session";
const OAUTH_STATE_COOKIE = "reading_shelf_oauth_state";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const OAUTH_STATE_MAX_AGE_SECONDS = 60 * 10;

function createSessionValue(user) {
  const now = Math.floor(Date.now() / 1000);
  const kakaoId = String(user.kakaoId || "");
  return signJson(
    {
      sub: String(user.id || kakaoId),
      kakaoId,
      nickname: user.nickname || "",
      iat: now,
      exp: now + SESSION_MAX_AGE_SECONDS,
    },
    getRequiredSessionSecret()
  );
}

function readSession(request) {
  const cookie = readCookie(request, SESSION_COOKIE);
  if (!cookie) return null;

  const session = verifySignedJson(cookie, getSessionSecret());
  if (!session || !session.sub || !session.exp) return null;
  if (session.exp < Math.floor(Date.now() / 1000)) return null;

  return {
    id: session.sub,
    kakaoId: session.kakaoId || "",
    nickname: session.nickname || "",
  };
}

function setSessionCookie(request, response, user) {
  appendSetCookie(
    response,
    serializeCookie(SESSION_COOKIE, createSessionValue(user), {
      request,
      maxAge: SESSION_MAX_AGE_SECONDS,
    })
  );
}

function clearSessionCookie(request, response) {
  appendSetCookie(
    response,
    serializeCookie(SESSION_COOKIE, "", {
      request,
      maxAge: 0,
    })
  );
}

function createOauthState() {
  return crypto.randomBytes(24).toString("base64url");
}

function setOauthStateCookie(request, response, state) {
  appendSetCookie(
    response,
    serializeCookie(OAUTH_STATE_COOKIE, signJson({ state }, getRequiredSessionSecret()), {
      request,
      maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
    })
  );
}

function readOauthState(request) {
  return verifySignedJson(readCookie(request, OAUTH_STATE_COOKIE), getSessionSecret())?.state || "";
}

function clearOauthStateCookie(request, response) {
  appendSetCookie(
    response,
    serializeCookie(OAUTH_STATE_COOKIE, "", {
      request,
      maxAge: 0,
    })
  );
}

function requireSession(request) {
  const session = readSession(request);
  if (!session) {
    const error = new Error("Unauthorized");
    error.statusCode = 401;
    error.publicMessage = "로그인이 필요합니다.";
    throw error;
  }

  return session;
}

function getRequiredSessionSecret() {
  return requireConfig("SESSION_SECRET", getSessionSecret());
}

function signJson(payload, secret) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

function verifySignedJson(value, secret) {
  if (!value || !secret) return null;

  const [encoded, signature] = String(value).split(".");
  if (!encoded || !signature) return null;

  const expected = sign(encoded, secret);
  if (!timingSafeEqual(signature, expected)) return null;

  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch (error) {
    return null;
  }
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function readCookie(request, name) {
  const cookies = parseCookieHeader(request.headers.cookie || "");
  return cookies[name] || "";
}

function parseCookieHeader(header) {
  return String(header)
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex === -1) return cookies;
      const key = decodeURIComponent(part.slice(0, separatorIndex));
      const value = decodeURIComponent(part.slice(separatorIndex + 1));
      return { ...cookies, [key]: value };
    }, {});
}

function serializeCookie(name, value, options) {
  const parts = [
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${options.maxAge}`,
  ];

  if (shouldUseSecureCookie(options.request)) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function shouldUseSecureCookie(request) {
  const proto = String(request.headers["x-forwarded-proto"] || "");
  const host = String(request.headers.host || "");
  return proto.includes("https") || (!host.startsWith("localhost") && !host.startsWith("127.0.0.1"));
}

function appendSetCookie(response, cookie) {
  const previous = response.getHeader("Set-Cookie");
  if (!previous) {
    response.setHeader("Set-Cookie", cookie);
    return;
  }

  response.setHeader("Set-Cookie", Array.isArray(previous) ? [...previous, cookie] : [previous, cookie]);
}

module.exports = {
  clearOauthStateCookie,
  clearSessionCookie,
  createOauthState,
  readOauthState,
  readSession,
  requireSession,
  setOauthStateCookie,
  setSessionCookie,
};
