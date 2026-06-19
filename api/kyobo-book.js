module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const rawUrl = String(request.query.url || "").trim();
  const parsed = parseKyoboUrl(rawUrl);
  if (!parsed) {
    response.status(400).json({ error: "지원하는 교보문고 상품 URL이 아닙니다." });
    return;
  }

  try {
    const book = await fetchKyoboBook(parsed);

    if (!book) {
      response.status(422).json({
        error: "교보문고 검색 결과에서 책 정보를 찾지 못했습니다. ISBN이 포함된 URL이나 Google Books/Open Library URL을 사용해 주세요.",
      });
      return;
    }

    response.status(200).json(book);
  } catch (error) {
    response.status(502).json({
      error: "교보문고 응답을 읽지 못했습니다. ISBN이 포함된 URL이나 Google Books/Open Library URL을 사용해 주세요.",
    });
  }
};

function parseKyoboUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch (error) {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  if (host !== "product.kyobobook.co.kr") return null;

  const match = url.pathname.match(/^\/detail\/([A-Z0-9]+)/i);
  if (!match) return null;

  return {
    productId: match[1],
    url: `https://product.kyobobook.co.kr/detail/${match[1]}`,
  };
}

async function fetchKyoboBook(parsed) {
  const detailBook = await fetchKyoboDetailBook(parsed).catch(() => null);
  const searchBook = await fetchKyoboSearchBook(parsed.productId).catch(() => null);

  if (detailBook && searchBook) {
    return mergeKyoboBooks(detailBook, searchBook, parsed.productId);
  }

  return detailBook ? { ...detailBook, id: `kyobo-${parsed.productId}` } : searchBook;
}

async function fetchKyoboDetailBook(parsed) {
  const html = await fetchKyoboHtml(parsed.url);
  return extractBookFromKyoboHtml(html, parsed.productId);
}

async function fetchKyoboSearchBook(productId) {
  const searchHtml = await fetchKyoboSearchHtml(productId);
  return extractBookFromKyoboSearchHtml(searchHtml, productId);
}

function mergeKyoboBooks(detailBook, searchBook, productId) {
  return {
    id: `kyobo-${productId}`,
    title: searchBook.title || detailBook.title,
    authors: searchBook.authors?.length ? searchBook.authors : detailBook.authors || [],
    publishedDate: searchBook.publishedDate || detailBook.publishedDate || "",
    coverUrl: searchBook.coverUrl || detailBook.coverUrl || "",
    isbn: searchBook.isbn || detailBook.isbn || "",
  };
}

async function fetchKyoboHtml(url) {
  const response = await fetch(url, {
    headers: {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error("Kyobo request failed");
  }

  const html = await response.text();
  if (!html.trim()) {
    throw new Error("Kyobo returned empty response");
  }

  return html;
}

async function fetchKyoboSearchHtml(productId) {
  const params = new URLSearchParams({ keyword: productId });
  const response = await fetch(`https://search.kyobobook.co.kr/search?${params}`, {
    headers: {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error("Kyobo search request failed");
  }

  const html = await response.text();
  if (!html.trim()) {
    throw new Error("Kyobo search returned empty response");
  }

  return html;
}

async function extractBookFromKyoboHtml(html, productId) {
  const jsonLdBook = extractJsonLdBook(html);
  if (jsonLdBook) return jsonLdBook;

  const metaBook = extractMetaBook(html, productId);
  if (metaBook?.isbn) {
    const enriched = await fetchGoogleBookByIsbn(metaBook.isbn);
    return {
      ...metaBook,
      ...enriched,
      id: `kyobo-${productId}`,
      title: enriched?.title || metaBook.title,
      authors: enriched?.authors?.length ? enriched.authors : metaBook.authors,
      coverUrl: enriched?.coverUrl || metaBook.coverUrl,
    };
  }

  return metaBook?.title ? metaBook : null;
}

function extractJsonLdBook(html) {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];

  for (const script of scripts) {
    const parsed = parseJsonLoose(decodeHtml(script[1]));
    const book = findBookJsonLd(parsed);
    if (!book) continue;

    return {
      id: book.isbn ? `kyobo-isbn-${book.isbn}` : `kyobo-${slugify(book.name || book.title || "book")}`,
      title: book.name || book.title || "",
      authors: normalizeJsonLdAuthors(book.author),
      publishedDate: book.datePublished || "",
      coverUrl: normalizeImage(book.image),
      isbn: normalizeIsbn(book.isbn),
    };
  }

  return null;
}

function extractMetaBook(html, productId) {
  const title =
    getMetaContent(html, "property", "og:title") ||
    getMetaContent(html, "name", "title") ||
    getTitleTag(html);
  const description =
    getMetaContent(html, "property", "og:description") || getMetaContent(html, "name", "description") || "";
  const coverUrl = getMetaContent(html, "property", "og:image");
  const isbn = extractIsbn(`${title} ${description} ${html}`);

  return {
    id: `kyobo-${productId}`,
    title: cleanKyoboTitle(title),
    authors: extractAuthors(description),
    publishedDate: "",
    coverUrl,
    isbn,
  };
}

async function extractBookFromKyoboSearchHtml(html, productId) {
  const itemHtml = extractKyoboSearchItemHtml(html, productId);
  if (!itemHtml) return null;

  const title =
    getElementText(
      itemHtml,
      new RegExp(`<span[^>]+id=["']cmdtName_${escapeRegExp(productId)}["'][^>]*>([\\s\\S]*?)<\\/span>`, "i")
    ) || getAttribute(itemHtml, "data-name");
  const isbn = normalizeIsbn(getAttribute(itemHtml, "data-bid") || itemHtml);
  const authors = extractKyoboSearchAuthors(itemHtml);
  const publishedDate = getElementText(
    itemHtml,
    /<span[^>]+class=["'][^"']*\bdate\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i
  );
  const coverUrl = isbn ? `https://contents.kyobobook.co.kr/sih/fit-in/458x0/pdt/${isbn}.jpg` : "";
  const googleBook = isbn ? await fetchGoogleBookByIsbn(isbn) : null;

  return {
    id: `kyobo-${productId}`,
    title: title || googleBook?.title || "",
    authors: authors.length ? authors : googleBook?.authors || [],
    publishedDate: publishedDate || googleBook?.publishedDate || "",
    coverUrl: coverUrl || googleBook?.coverUrl || "",
    isbn,
  };
}

function extractKyoboSearchItemHtml(html, productId) {
  const inputPattern = new RegExp(`<input[^>]+data-pid=["']${escapeRegExp(productId)}["'][^>]*>`, "i");
  const inputMatch = html.match(inputPattern);
  if (!inputMatch) return "";

  const itemStart = html.lastIndexOf("<li", inputMatch.index);
  if (itemStart === -1) return "";

  const nextItemStart = html.indexOf('<li class="prod_item"', inputMatch.index + inputMatch[0].length);
  const itemEnd = nextItemStart === -1 ? html.indexOf("</ul>", inputMatch.index) : nextItemStart;
  return html.slice(itemStart, itemEnd === -1 ? undefined : itemEnd);
}

function extractKyoboSearchAuthors(itemHtml) {
  const matches = [...itemHtml.matchAll(/<a[^>]+class=["'][^"']*\bauthor\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)];
  return matches.map((match) => cleanText(match[1])).filter(Boolean).slice(0, 3);
}

async function fetchGoogleBookByIsbn(isbn) {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  if (!apiKey || !isbn) return null;

  const params = new URLSearchParams({
    q: `isbn:${isbn}`,
    maxResults: "1",
    printType: "books",
    projection: "lite",
    key: apiKey,
  });

  const response = await fetch(`https://www.googleapis.com/books/v1/volumes?${params}`);
  if (!response.ok) return null;

  const data = await response.json();
  const info = data.items?.[0]?.volumeInfo;
  if (!info) return null;

  return {
    title: info.title || "",
    authors: Array.isArray(info.authors) ? info.authors : [],
    publishedDate: info.publishedDate || "",
    coverUrl: normalizeImage(info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || ""),
    isbn,
  };
}

function findBookJsonLd(value) {
  if (!value) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findBookJsonLd(item);
      if (found) return found;
    }
  }

  if (typeof value === "object") {
    const type = value["@type"];
    const types = Array.isArray(type) ? type : [type];
    if (types.some((entry) => String(entry).toLowerCase() === "book")) {
      return value;
    }

    if (value["@graph"]) return findBookJsonLd(value["@graph"]);
  }

  return null;
}

function parseJsonLoose(value) {
  try {
    return JSON.parse(value.trim());
  } catch (error) {
    return null;
  }
}

function getMetaContent(html, attr, name) {
  const escapedName = escapeRegExp(name);
  const pattern = new RegExp(`<meta[^>]+${attr}=["']${escapedName}["'][^>]*>`, "i");
  const tag = html.match(pattern)?.[0] || "";
  return decodeHtml(tag.match(/\scontent=["']([^"']*)["']/i)?.[1] || "");
}

function getTitleTag(html) {
  return decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
}

function getElementText(html, pattern) {
  return cleanText(html.match(pattern)?.[1] || "");
}

function getAttribute(html, name) {
  return decodeHtml(html.match(new RegExp(`\\s${escapeRegExp(name)}=["']([^"']*)["']`, "i"))?.[1] || "");
}

function cleanKyoboTitle(value) {
  return String(value)
    .replace(/\s*\|\s*교보문고.*$/i, "")
    .replace(/\s*-\s*교보문고.*$/i, "")
    .trim();
}

function extractAuthors(description) {
  const authorMatch = String(description).match(/(?:저자|지은이)\s*[:：]\s*([^|,]+)/);
  return authorMatch ? [authorMatch[1].trim()] : [];
}

function normalizeJsonLdAuthors(author) {
  if (!author) return [];
  const authors = Array.isArray(author) ? author : [author];
  return authors
    .map((entry) => (typeof entry === "string" ? entry : entry.name))
    .filter(Boolean)
    .slice(0, 3);
}

function normalizeImage(image) {
  const value = Array.isArray(image) ? image[0] : image;
  return String(value || "").replace(/^http:/, "https:");
}

function normalizeIsbn(value) {
  return extractIsbn(Array.isArray(value) ? value.join(" ") : value);
}

function cleanText(value) {
  return decodeHtml(String(value).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function extractIsbn(value) {
  const candidates = String(value).match(/(?:97[89][-\s]?)?\d[\d-\s]{8,}[\dXx]/g) || [];

  for (const candidate of candidates) {
    const isbn = candidate.replace(/[^0-9Xx]/g, "").toUpperCase();
    if (isValidIsbn(isbn)) return isbn;
  }

  return "";
}

function isValidIsbn(isbn) {
  if (isbn.length === 10) {
    const sum = isbn.split("").reduce((total, char, index) => {
      const value = char === "X" ? 10 : Number(char);
      return total + value * (10 - index);
    }, 0);
    return sum % 11 === 0;
  }

  if (isbn.length === 13 && /^\d+$/.test(isbn)) {
    const sum = isbn.split("").reduce((total, char, index) => {
      const value = Number(char);
      return total + value * (index % 2 === 0 ? 1 : 3);
    }, 0);
    return sum % 10 === 0;
  }

  return false;
}

function decodeHtml(value) {
  return String(value)
    .replaceAll("&quot;", "\"")
    .replaceAll("&#34;", "\"")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&#39;", "'");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9가-힣]+/gi, "-").replace(/^-|-$/g, "");
}
