const { handleApiError, json, methodNotAllowed } = require("../server/http");
const { createBook, deleteBook, listBooks, updateBook } = require("../server/supabase");
const { requireSession } = require("../server/session");

module.exports = async function handler(request, response) {
  try {
    const session = requireSession(request);

    if (request.method === "GET") {
      json(response, 200, { books: await listBooks(session.id) });
      return;
    }

    if (request.method === "POST") {
      json(response, 201, { book: await createBook(session.id, getBody(request)) });
      return;
    }

    if (request.method === "PATCH") {
      const body = getBody(request);
      const bookKey = String(request.query.id || body.id || "");
      requireBookKey(bookKey);
      json(response, 200, { book: await updateBook(session.id, bookKey, body) });
      return;
    }

    if (request.method === "DELETE") {
      const bookKey = String(request.query.id || "");
      requireBookKey(bookKey);
      await deleteBook(session.id, bookKey);
      json(response, 200, { ok: true });
      return;
    }

    methodNotAllowed(response, ["GET", "POST", "PATCH", "DELETE"]);
  } catch (error) {
    handleApiError(response, error, "책 저장 요청에 실패했습니다.");
  }
};

function getBody(request) {
  if (!request.body) return {};
  if (typeof request.body === "string") {
    try {
      return JSON.parse(request.body);
    } catch (error) {
      return {};
    }
  }

  return request.body;
}

function requireBookKey(bookKey) {
  if (bookKey) return;
  const error = new Error("Missing book id");
  error.statusCode = 400;
  error.publicMessage = "책 ID가 필요합니다.";
  throw error;
}
