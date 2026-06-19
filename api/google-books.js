const GOOGLE_BOOKS_BASE_URL = "https://www.googleapis.com/books/v1/volumes";

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  if (!apiKey) {
    response.status(503).json({ error: "Google Books API key is not configured" });
    return;
  }

  const type = String(request.query.type || "");

  try {
    if (type === "search") {
      await proxyGoogleBooksSearch(request, response, apiKey);
      return;
    }

    if (type === "volume") {
      await proxyGoogleBooksVolume(request, response, apiKey);
      return;
    }

    response.status(400).json({ error: "Unsupported request type" });
  } catch (error) {
    response.status(502).json({ error: "Google Books request failed" });
  }
};

async function proxyGoogleBooksSearch(request, response, apiKey) {
  const query = String(request.query.q || "").trim();
  if (!query) {
    response.status(400).json({ error: "Missing query" });
    return;
  }

  const maxResults = clampMaxResults(request.query.maxResults);
  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
    printType: "books",
    projection: "lite",
    orderBy: "relevance",
    key: apiKey,
  });

  await proxyJsonResponse(`${GOOGLE_BOOKS_BASE_URL}?${params}`, response);
}

async function proxyGoogleBooksVolume(request, response, apiKey) {
  const volumeId = String(request.query.id || "").trim();
  if (!volumeId) {
    response.status(400).json({ error: "Missing volume id" });
    return;
  }

  const params = new URLSearchParams({ key: apiKey });
  const url = `${GOOGLE_BOOKS_BASE_URL}/${encodeURIComponent(volumeId)}?${params}`;
  await proxyJsonResponse(url, response);
}

async function proxyJsonResponse(url, response) {
  const googleResponse = await fetch(url);
  const body = await googleResponse.text();

  response.status(googleResponse.status);
  response.setHeader("Content-Type", googleResponse.headers.get("content-type") || "application/json");
  response.send(body);
}

function clampMaxResults(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 40;
  return Math.min(Math.max(Math.trunc(parsed), 1), 40);
}
