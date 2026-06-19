const { json, methodNotAllowed } = require("../../server/http");
const { clearSessionCookie } = require("../../server/session");

module.exports = async function handler(request, response) {
  if (request.method !== "POST" && request.method !== "GET") {
    methodNotAllowed(response, ["POST", "GET"]);
    return;
  }

  clearSessionCookie(request, response);
  json(response, 200, { ok: true });
};
