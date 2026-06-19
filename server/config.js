const DEFAULT_SUPABASE_URL = "https://moukuiskpthvzftcnmog.supabase.co";

function getSupabaseUrl() {
  return normalizeUrl(process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL);
}

function getSupabaseSecretKey() {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function getKakaoRestApiKey() {
  return process.env.KAKAO_REST_API_KEY || process.env.KAKAO_CLIENT_ID || "";
}

function getKakaoClientSecret() {
  return process.env.KAKAO_CLIENT_SECRET || "";
}

function getSessionSecret() {
  return process.env.SESSION_SECRET || "";
}

function getSiteUrl() {
  return normalizeUrl(process.env.SITE_URL || "");
}

function normalizeUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function requireConfig(name, value) {
  if (!value) {
    const error = new Error(`${name} is not configured`);
    error.statusCode = 503;
    throw error;
  }

  return value;
}

module.exports = {
  getKakaoClientSecret,
  getKakaoRestApiKey,
  getSessionSecret,
  getSiteUrl,
  getSupabaseSecretKey,
  getSupabaseUrl,
  requireConfig,
};
