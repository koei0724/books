const { getSupabaseSecretKey, getSupabaseUrl, requireConfig } = require("./config");

const BOOK_SELECT =
  "id,book_key,source,source_label,title,authors,first_publish_year,cover_id,cover_url,isbn,added_at,reading_now,read_date,completed_without_date,review";
const USER_SELECT = "id,kakao_id,nickname,created_at,updated_at";

async function getOrCreateUser({ kakaoId, nickname }) {
  const existing = await findUserByKakaoId(kakaoId);
  if (existing) {
    if (nickname && nickname !== existing.nickname) {
      const updated = await updateUser(existing.id, { nickname });
      return toUser(updated || existing);
    }

    return toUser(existing);
  }

  const rows = await supabaseRequest("/app_users", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      kakao_id: kakaoId,
      nickname: nickname || "",
    },
  });

  return toUser(rows[0]);
}

async function listBooks(userId) {
  const params = new URLSearchParams({
    select: BOOK_SELECT,
    user_id: `eq.${userId}`,
    order: "added_at.desc",
  });
  const rows = await supabaseRequest(`/books?${params}`);
  return rows.map(toBook);
}

async function createBook(userId, book) {
  const normalized = normalizeBookPayload(book);
  const existing = await findBookByKey(userId, normalized.book_key);
  if (existing) return toBook(existing);

  const rows = await supabaseRequest("/books", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      user_id: userId,
      ...normalized,
    },
  });

  return toBook(rows[0]);
}

async function updateBook(userId, bookKey, patch) {
  const params = new URLSearchParams({
    select: BOOK_SELECT,
    user_id: `eq.${userId}`,
    book_key: `eq.${bookKey}`,
  });
  const rows = await supabaseRequest(`/books?${params}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: normalizeBookPatch(patch),
  });

  if (!rows.length) {
    const error = new Error("Book not found");
    error.statusCode = 404;
    error.publicMessage = "책을 찾지 못했습니다.";
    throw error;
  }

  return toBook(rows[0]);
}

async function deleteBook(userId, bookKey) {
  const params = new URLSearchParams({
    user_id: `eq.${userId}`,
    book_key: `eq.${bookKey}`,
  });
  await supabaseRequest(`/books?${params}`, { method: "DELETE" });
}

async function findUserByKakaoId(kakaoId) {
  const params = new URLSearchParams({
    select: USER_SELECT,
    kakao_id: `eq.${kakaoId}`,
    limit: "1",
  });
  const rows = await supabaseRequest(`/app_users?${params}`);
  return rows[0] || null;
}

async function updateUser(userId, patch) {
  const params = new URLSearchParams({
    select: USER_SELECT,
    id: `eq.${userId}`,
  });
  const rows = await supabaseRequest(`/app_users?${params}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: {
      ...patch,
      updated_at: new Date().toISOString(),
    },
  });
  return rows[0] || null;
}

async function findBookByKey(userId, bookKey) {
  const params = new URLSearchParams({
    select: BOOK_SELECT,
    user_id: `eq.${userId}`,
    book_key: `eq.${bookKey}`,
    limit: "1",
  });
  const rows = await supabaseRequest(`/books?${params}`);
  return rows[0] || null;
}

async function supabaseRequest(path, options = {}) {
  const url = `${requireConfig("SUPABASE_URL", getSupabaseUrl())}/rest/v1${path}`;
  const key = requireConfig("SUPABASE_SECRET_KEY", getSupabaseSecretKey());
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: getSupabaseHeaders(key, options.headers),
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const payload = text ? parseJson(text) : null;

  if (!response.ok) {
    const error = new Error(payload?.message || text || "Supabase request failed");
    error.statusCode = response.status >= 500 ? 502 : response.status;
    error.publicMessage = "서버 저장소 요청에 실패했습니다.";
    throw error;
  }

  return Array.isArray(payload) ? payload : payload ? [payload] : [];
}

function getSupabaseHeaders(key, headers = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    ...headers,
  };
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function normalizeBookPayload(book) {
  const bookKey = stringValue(book.id || book.bookKey || book.book_key);
  const title = stringValue(book.title);
  if (!bookKey || !title) {
    const error = new Error("Invalid book payload");
    error.statusCode = 400;
    error.publicMessage = "책 정보가 올바르지 않습니다.";
    throw error;
  }

  return {
    book_key: bookKey,
    source: stringValue(book.source),
    source_label: stringValue(book.sourceLabel || book.source_label),
    title,
    authors: Array.isArray(book.authors) ? book.authors.map(stringValue).filter(Boolean).slice(0, 6) : [],
    first_publish_year: stringValue(book.firstPublishYear || book.first_publish_year),
    cover_id: stringValue(book.coverId || book.cover_id),
    cover_url: stringValue(book.coverUrl || book.cover_url),
    isbn: stringValue(book.isbn),
    added_at: normalizeTimestamp(book.addedAt || book.added_at) || new Date().toISOString(),
    reading_now: Boolean(book.readingNow || book.reading_now),
    read_date: normalizeDate(book.readDate || book.read_date),
    completed_without_date: Boolean(book.completedWithoutDate || book.completed_without_date),
    review: stringValue(book.review),
  };
}

function normalizeBookPatch(patch) {
  return {
    reading_now: Boolean(patch.readingNow || patch.reading_now),
    read_date: normalizeDate(patch.readDate || patch.read_date),
    completed_without_date: Boolean(patch.completedWithoutDate || patch.completed_without_date),
    review: stringValue(patch.review),
    updated_at: new Date().toISOString(),
  };
}

function toBook(row) {
  return {
    id: row.book_key,
    source: row.source || "",
    sourceLabel: row.source_label || "",
    title: row.title || "",
    authors: Array.isArray(row.authors) ? row.authors : [],
    firstPublishYear: row.first_publish_year || "",
    coverId: row.cover_id || "",
    coverUrl: row.cover_url || "",
    isbn: row.isbn || "",
    addedAt: row.added_at || "",
    readingNow: Boolean(row.reading_now),
    readDate: row.read_date || "",
    completedWithoutDate: Boolean(row.completed_without_date),
    review: row.review || "",
  };
}

function toUser(row) {
  return {
    id: row.id,
    kakaoId: row.kakao_id,
    nickname: row.nickname || "",
  };
}

function stringValue(value) {
  return String(value || "").trim();
}

function normalizeTimestamp(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
}

function normalizeDate(value) {
  const match = String(value || "").match(/^\d{4}-\d{2}-\d{2}$/);
  return match ? match[0] : null;
}

module.exports = {
  createBook,
  deleteBook,
  getOrCreateUser,
  listBooks,
  updateBook,
};
