function json(response, statusCode, payload) {
  response.status(statusCode);
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.send(JSON.stringify(payload));
}

function methodNotAllowed(response, allowedMethods) {
  response.setHeader("Allow", allowedMethods.join(", "));
  json(response, 405, { error: "Method not allowed" });
}

function redirect(response, location, statusCode = 302) {
  response.statusCode = statusCode;
  response.setHeader("Location", location);
  response.end();
}

function getOrigin(request) {
  const siteUrl = process.env.SITE_URL;
  if (siteUrl) return siteUrl.replace(/\/+$/, "");

  const host = request.headers["x-forwarded-host"] || request.headers.host;
  const protocol = request.headers["x-forwarded-proto"] || (String(host).startsWith("localhost") ? "http" : "https");
  return `${String(protocol).split(",")[0]}://${String(host).split(",")[0]}`;
}

function getHomeRedirect(request, suffix = "") {
  return `${getOrigin(request)}/#shelf${suffix}`;
}

function handleApiError(response, error, fallbackMessage = "Request failed") {
  const statusCode = Number(error.statusCode) || 500;
  json(response, statusCode, { error: error.publicMessage || fallbackMessage });
}

module.exports = {
  getHomeRedirect,
  getOrigin,
  handleApiError,
  json,
  methodNotAllowed,
  redirect,
};
