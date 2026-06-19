const { json, methodNotAllowed } = require("../server/http");
const { readSession } = require("../server/session");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    methodNotAllowed(response, ["GET"]);
    return;
  }

  const session = readSession(request);
  if (!session) {
    json(response, 200, { authenticated: false, user: null });
    return;
  }

  json(response, 200, {
    authenticated: true,
    user: {
      id: session.id,
      nickname: session.nickname,
    },
  });
};
