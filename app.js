const STORAGE_KEY = "reading-shelf.books.v1";
const OPEN_LIBRARY_LIMIT = 30;
const GOOGLE_BOOKS_LIMIT = 40;

const form = document.querySelector("#search-form");
const searchInput = document.querySelector("#search-input");
const resultsList = document.querySelector("#results-list");
const statusLine = document.querySelector("#status-line");
const searchCount = document.querySelector("#search-count");
const shelfGrid = document.querySelector("#shelf-grid");
const shelfCount = document.querySelector("#shelf-count");
const emptyShelf = document.querySelector("#empty-shelf");
const pageViews = document.querySelectorAll("[data-page]");
const routeLinks = document.querySelectorAll("[data-route-link]");
const pageEyebrow = document.querySelector("#page-eyebrow");
const pageTitle = document.querySelector("#page-title");
const pageSummary = document.querySelector("#page-summary");
const authUser = document.querySelector("#auth-user");
const loginLink = document.querySelector("#login-link");
const logoutButton = document.querySelector("#logout-button");

const dialog = document.querySelector("#book-dialog");
const bookForm = document.querySelector("#book-form");
const detailCoverWrap = document.querySelector("#detail-cover-wrap");
const detailTitle = document.querySelector("#detail-title");
const detailAuthor = document.querySelector("#detail-author");
const detailMeta = document.querySelector("#detail-meta");
const detailYear = document.querySelector("#detail-year");
const detailReadState = document.querySelector("#detail-read-state");
const detailReviewState = document.querySelector("#detail-review-state");
const detailNoteCount = document.querySelector("#detail-note-count");
const readingNowInput = document.querySelector("#reading-now");
const readDateInput = document.querySelector("#read-date");
const readDateUnknownInput = document.querySelector("#read-date-unknown");
const reviewText = document.querySelector("#review-text");
const deleteBookButton = document.querySelector("#delete-book");
const dialogCloseButtons = document.querySelectorAll("[data-dialog-close]");

let shelfBooks = readShelf();
let currentUser = null;
let activeBookId = null;
let lastResults = [];
let lastSearchSources = {
  googleBooks: false,
  openLibrary: false,
};

const PAGE_COPY = {
  shelf: {
    eyebrow: "Library",
    title: "내 서재",
    summary: "읽고 있는 책과 독서 기록을 한곳에서 관리합니다.",
  },
  search: {
    eyebrow: "Search",
    title: "책 찾기",
    summary: "내 서재에 새 표지를 꽂습니다.",
  },
};

renderAuthState();
renderShelf();
renderRoute();
initAuth();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();

  if (!query) {
    setStatus("");
    renderResults([]);
    return;
  }

  if (parseBookUrl(query)) {
    setStatus("URL에서 책 정보를 가져오는 중입니다.");
    renderResults([]);

    try {
      const book = await fetchBookFromUrl(query);
      await addToShelf(book);
      searchInput.value = "";
    } catch (error) {
      setStatus(error.message || "이 URL에서는 책 정보를 가져올 수 없습니다. 검색창의 URL을 확인해 주세요.");
    }
    return;
  }

  setStatus("검색 중입니다.");
  renderResults([]);

  try {
    const books = await searchBooks(query);
    lastResults = books;
    renderResults(books);
    setStatus(books.length ? getSearchSuccessMessage() : "검색 결과가 없습니다.");
  } catch (error) {
    setStatus("검색에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  }
});

resultsList.addEventListener("click", async (event) => {
  const item = event.target.closest("[data-result-id]");
  if (!item) return;

  const book = lastResults.find((candidate) => candidate.id === item.dataset.resultId);
  if (!book) return;

  await addToShelf(book);
});

shelfGrid.addEventListener("click", (event) => {
  const item = event.target.closest("[data-book-id]");
  if (!item) return;

  openBook(item.dataset.bookId);
});

bookForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveActiveBook();
  dialog.close();
});

deleteBookButton.addEventListener("click", async () => {
  if (!activeBookId) return;

  const targetBookId = activeBookId;
  if (currentUser) {
    try {
      await deleteRemoteBook(targetBookId);
    } catch (error) {
      setStatus("서버에서 책을 삭제하지 못했습니다.");
      return;
    }
  }

  shelfBooks = shelfBooks.filter((book) => book.id !== targetBookId);
  persistShelf();
  renderShelf();
  dialog.close();
});

dialogCloseButtons.forEach((button) => {
  button.addEventListener("click", () => dialog.close());
});

readDateInput.addEventListener("change", () => {
  if (readDateInput.value) {
    readingNowInput.checked = false;
    readDateUnknownInput.checked = false;
  }
  syncReadDateControls();
  updateDetailDraftState();
});
readDateUnknownInput.addEventListener("change", () => {
  if (readDateUnknownInput.checked) {
    readingNowInput.checked = false;
    readDateInput.value = "";
  }
  syncReadDateControls();
  updateDetailDraftState();
});
readingNowInput.addEventListener("change", () => {
  if (readingNowInput.checked) {
    readDateInput.value = "";
    readDateUnknownInput.checked = false;
  }
  syncReadDateControls();
  updateDetailDraftState();
});
reviewText.addEventListener("input", updateDetailDraftState);

dialog.addEventListener("close", () => {
  activeBookId = null;
});

window.addEventListener("hashchange", renderRoute);

logoutButton.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
  currentUser = null;
  shelfBooks = readShelf();
  renderAuthState();
  renderShelf();
});

async function initAuth() {
  try {
    const session = await fetchCurrentUser();
    currentUser = session?.authenticated ? session.user : null;
    renderAuthState();

    if (!currentUser) return;
  } catch (error) {
    currentUser = null;
    renderAuthState();
    return;
  }

  try {
    await importGuestShelf();
    shelfBooks = await fetchRemoteShelf();
    renderShelf();
  } catch (error) {
    setStatus("로그인은 되었지만 서재 데이터를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.");
  }
}

async function searchBooks(query) {
  const searches = await Promise.allSettled([searchGoogleBooks(query), searchOpenLibrary(query)]);
  lastSearchSources = {
    googleBooks: searches[0].status === "fulfilled",
    openLibrary: searches[1].status === "fulfilled",
  };
  const books = searches.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  const uniqueBooks = dedupeBooks(books);

  if (!uniqueBooks.length && searches.every((result) => result.status === "rejected")) {
    throw new Error("Book search failed");
  }

  return uniqueBooks;
}

async function searchOpenLibrary(query) {
  const params = new URLSearchParams({
    q: query,
    limit: String(OPEN_LIBRARY_LIMIT),
    fields: "key,title,author_name,first_publish_year,cover_i,isbn",
  });

  const response = await fetch(`https://openlibrary.org/search.json?${params}`);
  if (!response.ok) {
    throw new Error("Book search failed");
  }

  const data = await response.json();
  return (data.docs || []).map(normalizeOpenLibraryResult).filter(Boolean);
}

async function searchGoogleBooks(query) {
  const params = new URLSearchParams({
    type: "search",
    q: query,
    maxResults: String(GOOGLE_BOOKS_LIMIT),
  });

  const response = await fetch(`/api/google-books?${params}`);
  if (!response.ok) {
    throw new Error("Google Books search failed");
  }

  const data = await response.json();
  return (data.items || []).map(normalizeGoogleBooksResult).filter(Boolean);
}

async function fetchBookFromUrl(value) {
  const parsed = parseBookUrl(value);
  if (!parsed) {
    throw new Error("지원하는 책 URL을 찾지 못했습니다. Open Library, Google Books, ISBN이 포함된 URL을 입력해 주세요.");
  }

  if (parsed.type === "google-volume") {
    return fetchGoogleBookById(parsed.id);
  }

  if (parsed.type === "kyobo-product") {
    return fetchKyoboBook(parsed.url);
  }

  if (parsed.type === "open-library-work") {
    return fetchOpenLibraryWork(parsed.id);
  }

  if (parsed.type === "open-library-edition") {
    return fetchOpenLibraryEdition(parsed.id);
  }

  if (parsed.type === "isbn") {
    return fetchOpenLibraryIsbn(parsed.isbn);
  }

  throw new Error("지원하지 않는 책 URL입니다.");
}

function parseBookUrl(value) {
  const trimmed = value.trim();
  const directIsbn = extractIsbn(trimmed);
  if (directIsbn && !trimmed.startsWith("http")) {
    return { type: "isbn", isbn: directIsbn };
  }

  let url;
  try {
    url = new URL(trimmed);
  } catch (error) {
    return directIsbn ? { type: "isbn", isbn: directIsbn } : null;
  }

  const host = url.hostname.replace(/^www\./, "");
  const path = url.pathname.replace(/\.json$/, "");

  if (host === "books.google.com" || host.startsWith("books.google.")) {
    const id = url.searchParams.get("id");
    return id ? { type: "google-volume", id } : null;
  }

  if (host === "product.kyobobook.co.kr") {
    const productMatch = path.match(/^\/detail\/([A-Z0-9]+)/i);
    if (productMatch) {
      return { type: "kyobo-product", productId: productMatch[1], url: url.href };
    }
  }

  if (host === "openlibrary.org") {
    const workMatch = path.match(/^\/works\/(OL\d+W)/i);
    if (workMatch) return { type: "open-library-work", id: workMatch[1].toUpperCase() };

    const editionMatch = path.match(/^\/books\/(OL\d+M)/i);
    if (editionMatch) return { type: "open-library-edition", id: editionMatch[1].toUpperCase() };

    const isbnMatch = path.match(/^\/isbn\/([^/]+)/i);
    const isbn = isbnMatch ? extractIsbn(isbnMatch[1]) : "";
    if (isbn) return { type: "isbn", isbn };
  }

  const isbn = extractIsbn(trimmed);
  return isbn ? { type: "isbn", isbn } : null;
}

async function fetchGoogleBookById(volumeId) {
  const params = new URLSearchParams({
    type: "volume",
    id: volumeId,
  });

  const response = await fetch(`/api/google-books?${params}`);
  if (response.status === 503) {
    throw new Error("Google Books 연동 설정이 필요합니다. Open Library URL이나 ISBN URL을 사용해 주세요.");
  }

  if (!response.ok) {
    throw new Error("Google Books에서 책 정보를 가져오지 못했습니다.");
  }

  const data = await response.json();
  const book = normalizeGoogleBooksResult(data);
  if (!book) {
    throw new Error("Google Books URL에서 제목 정보를 찾지 못했습니다.");
  }

  return book;
}

async function fetchKyoboBook(url) {
  const params = new URLSearchParams({ url });
  const response = await fetch(`/api/kyobo-book?${params}`);

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      data.error || "교보문고 URL에서 책 정보를 가져오지 못했습니다. ISBN이 포함된 URL이나 Open Library URL을 사용해 주세요."
    );
  }

  const book = await response.json();
  if (!book?.title) {
    throw new Error("교보문고 URL에서 제목 정보를 찾지 못했습니다.");
  }

  return {
    id: book.id,
    source: "kyobo",
    sourceLabel: "교보문고 URL",
    title: book.title,
    authors: Array.isArray(book.authors) ? book.authors.slice(0, 3) : [],
    firstPublishYear: getPublishedYear(book.publishedDate),
    coverId: "",
    coverUrl: book.coverUrl || "",
    isbn: book.isbn || "",
    addedAt: new Date().toISOString(),
    readingNow: false,
    readDate: "",
    completedWithoutDate: false,
    review: "",
  };
}

async function fetchOpenLibraryWork(workId) {
  const response = await fetch(`https://openlibrary.org/works/${workId}.json`);
  if (!response.ok) {
    throw new Error("Open Library 작품 URL에서 책 정보를 가져오지 못했습니다.");
  }

  const data = await response.json();
  const authors = await resolveOpenLibraryAuthors(data.authors);
  const coverId = getFirstArrayValue(data.covers);

  return {
    id: workId,
    source: "open-library",
    sourceLabel: "Open Library URL",
    title: data.title || "제목 정보 없음",
    authors,
    firstPublishYear: getPublishedYear(data.first_publish_date),
    coverId,
    coverUrl: "",
    isbn: "",
    addedAt: new Date().toISOString(),
    readingNow: false,
    readDate: "",
    completedWithoutDate: false,
    review: "",
  };
}

async function fetchOpenLibraryEdition(editionId) {
  const response = await fetch(`https://openlibrary.org/books/${editionId}.json`);
  if (!response.ok) {
    throw new Error("Open Library 도서 URL에서 책 정보를 가져오지 못했습니다.");
  }

  const data = await response.json();
  return normalizeOpenLibraryEdition(data, editionId);
}

async function fetchOpenLibraryIsbn(isbn) {
  const response = await fetch(`https://openlibrary.org/isbn/${isbn}.json`);
  if (!response.ok) {
    throw new Error("이 ISBN으로 Open Library에서 책 정보를 찾지 못했습니다.");
  }

  const data = await response.json();
  const editionId = data.key?.replace("/books/", "") || `isbn-${isbn}`;
  return normalizeOpenLibraryEdition(data, editionId);
}

async function normalizeOpenLibraryEdition(data, fallbackId) {
  const authors = await resolveOpenLibraryAuthors(data.authors);
  const isbn = getFirstArrayValue(data.isbn_13) || getFirstArrayValue(data.isbn_10) || "";

  return {
    id: fallbackId,
    source: "open-library",
    sourceLabel: "Open Library URL",
    title: data.title || "제목 정보 없음",
    authors,
    firstPublishYear: getPublishedYear(data.publish_date),
    coverId: getFirstArrayValue(data.covers),
    coverUrl: "",
    isbn,
    addedAt: new Date().toISOString(),
    readingNow: false,
    readDate: "",
    completedWithoutDate: false,
    review: "",
  };
}

async function resolveOpenLibraryAuthors(authors) {
  if (!Array.isArray(authors) || !authors.length) return [];

  const names = authors
    .map((entry) => entry.name)
    .filter(Boolean)
    .slice(0, 3);
  if (names.length) return names;

  const authorKeys = authors
    .map((entry) => entry.author?.key || entry.key)
    .filter(Boolean)
    .slice(0, 3);

  const responses = await Promise.allSettled(
    authorKeys.map(async (key) => {
      const response = await fetch(`https://openlibrary.org${key}.json`);
      if (!response.ok) return "";
      const data = await response.json();
      return data.name || data.personal_name || "";
    })
  );

  return responses
    .filter((result) => result.status === "fulfilled" && result.value)
    .map((result) => result.value);
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

function getFirstArrayValue(value) {
  return Array.isArray(value) && value.length ? value[0] : "";
}

function getCurrentRoute() {
  const route = window.location.hash.replace("#", "");
  return Object.prototype.hasOwnProperty.call(PAGE_COPY, route) ? route : "shelf";
}

function navigateToPage(route) {
  const nextRoute = Object.prototype.hasOwnProperty.call(PAGE_COPY, route) ? route : "shelf";
  if (window.location.hash === `#${nextRoute}`) {
    renderRoute();
    return;
  }

  window.location.hash = nextRoute;
}

function renderRoute() {
  const route = getCurrentRoute();
  const copy = PAGE_COPY[route];

  pageViews.forEach((view) => {
    view.hidden = view.dataset.page !== route;
  });

  routeLinks.forEach((link) => {
    const isCurrent = link.dataset.routeLink === route;
    if (isCurrent) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  pageEyebrow.textContent = copy.eyebrow;
  pageTitle.textContent = copy.title;
  pageSummary.textContent = copy.summary;
  document.title = route === "search" ? "책 찾기 - 나의 디지털 책꽂이" : "나의 디지털 책꽂이";
}

function normalizeOpenLibraryResult(item) {
  if (!item.key || !item.title) return null;

  const authors = Array.isArray(item.author_name) ? item.author_name.slice(0, 3) : [];
  const isbn = Array.isArray(item.isbn) ? item.isbn[0] : "";

  return {
    id: item.key.replace("/works/", ""),
    source: "open-library",
    sourceLabel: "Open Library",
    title: item.title,
    authors,
    firstPublishYear: item.first_publish_year || "",
    coverId: item.cover_i || "",
    coverUrl: "",
    isbn,
    addedAt: new Date().toISOString(),
    readingNow: false,
    readDate: "",
    completedWithoutDate: false,
    review: "",
  };
}

function normalizeGoogleBooksResult(item) {
  const info = item.volumeInfo || {};
  if (!item.id || !info.title) return null;

  const authors = Array.isArray(info.authors) ? info.authors.slice(0, 3) : [];
  const isbn = getGoogleBookIsbn(info.industryIdentifiers);

  return {
    id: `google-${item.id}`,
    source: "google-books",
    sourceLabel: "Google Books",
    title: info.title,
    authors,
    firstPublishYear: getPublishedYear(info.publishedDate),
    coverId: "",
    coverUrl: getGoogleCoverUrl(info.imageLinks),
    isbn,
    addedAt: new Date().toISOString(),
    readingNow: false,
    readDate: "",
    completedWithoutDate: false,
    review: "",
  };
}

function getGoogleBookIsbn(identifiers) {
  if (!Array.isArray(identifiers)) return "";
  return (
    identifiers.find((identifier) => identifier.type === "ISBN_13")?.identifier ||
    identifiers.find((identifier) => identifier.type === "ISBN_10")?.identifier ||
    ""
  );
}

function getPublishedYear(publishedDate) {
  const match = String(publishedDate || "").match(/\d{4}/);
  return match ? match[0] : "";
}

function getGoogleCoverUrl(imageLinks) {
  const url = imageLinks?.thumbnail || imageLinks?.smallThumbnail || "";
  return url.replace(/^http:/, "https:");
}

function dedupeBooks(books) {
  const seen = new Set();

  return books.filter((book) => {
    const key = getDedupeKey(book);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getDedupeKey(book) {
  if (book.isbn) return `isbn:${book.isbn.replaceAll("-", "")}`;
  const title = normalizeDedupeText(book.title);
  const author = normalizeDedupeText(book.authors[0] || "");
  return `title:${title}|author:${author}`;
}

function normalizeDedupeText(value) {
  return String(value).toLowerCase().replace(/\s+/g, "");
}

async function addToShelf(book) {
  const existing = shelfBooks.find((candidate) => candidate.id === book.id);

  if (existing) {
    navigateToPage("shelf");
    return;
  }

  const nextBook = { ...book, addedAt: new Date().toISOString() };

  if (currentUser) {
    try {
      const savedBook = await createRemoteBook(nextBook);
      shelfBooks = [savedBook, ...shelfBooks.filter((candidate) => candidate.id !== savedBook.id)];
    } catch (error) {
      setStatus("서버에 책을 추가하지 못했습니다.");
      return;
    }
  } else {
    shelfBooks = [nextBook, ...shelfBooks];
  }

  persistShelf();
  renderShelf();
  navigateToPage("shelf");
}

function renderResults(books) {
  searchCount.textContent = `${books.length}권`;
  resultsList.replaceChildren(...books.map(createResultButton));
}

function createResultButton(book) {
  const button = document.createElement("button");
  button.className = "result-item";
  button.type = "button";
  button.dataset.resultId = book.id;
  button.setAttribute("aria-label", `${book.title} 서재에 추가`);

  button.append(createCoverElement(book, "result-cover"));

  const info = document.createElement("div");
  const title = document.createElement("p");
  const author = document.createElement("p");
  const meta = document.createElement("p");

  title.className = "result-title";
  author.className = "result-author";
  meta.className = "result-meta";

  title.textContent = book.title;
  author.textContent = formatAuthors(book.authors);
  meta.textContent = formatResultMeta(book);

  info.append(title, author, meta);
  button.append(info);

  return button;
}

function renderShelf() {
  const sortedBooks = getSortedShelfBooks();
  shelfCount.textContent = `${shelfBooks.length}권`;
  emptyShelf.classList.toggle("is-visible", shelfBooks.length === 0);
  shelfGrid.replaceChildren(...sortedBooks.map(createShelfButton));
}

function getSortedShelfBooks() {
  return shelfBooks
    .map((book, index) => ({ book, index }))
    .sort(compareShelfEntries)
    .map((entry) => entry.book);
}

function compareShelfEntries(a, b) {
  const aReadTime = getReadDateTime(a.book.readDate);
  const bReadTime = getReadDateTime(b.book.readDate);

  if (aReadTime !== bReadTime) {
    if (aReadTime && bReadTime) return bReadTime - aReadTime;
    if (aReadTime) return -1;
    if (bReadTime) return 1;
  }

  if (a.book.completedWithoutDate !== b.book.completedWithoutDate) {
    return a.book.completedWithoutDate ? -1 : 1;
  }

  const addedTimeDiff = getTimestamp(b.book.addedAt) - getTimestamp(a.book.addedAt);
  return addedTimeDiff || a.index - b.index;
}

function getReadDateTime(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) return 0;
  return Date.UTC(year, month - 1, day);
}

function getTimestamp(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : 0;
}

function createShelfButton(book) {
  const button = document.createElement("button");
  button.className = "shelf-book";
  button.type = "button";
  button.dataset.bookId = book.id;
  button.setAttribute("aria-label", `${book.title} 기록 열기`);

  const coverFrame = document.createElement("span");
  coverFrame.className = "book-cover-frame";
  coverFrame.append(createCoverElement(book, "book-cover"));

  const title = document.createElement("p");
  const author = document.createElement("p");
  const state = document.createElement("p");
  const meter = document.createElement("span");

  title.className = "book-title";
  author.className = "book-author";
  state.className = "book-state";
  meter.className = "book-meter";
  title.textContent = book.title;
  author.textContent = formatAuthors(book.authors);
  state.textContent = getBookState(book);
  meter.style.setProperty("--meter-value", `${getRecordProgress(book)}%`);

  button.append(coverFrame, title, author, state, meter);
  return button;
}

function openBook(bookId) {
  const book = shelfBooks.find((candidate) => candidate.id === bookId);
  if (!book) return;

  activeBookId = book.id;
  detailTitle.textContent = book.title;
  detailAuthor.textContent = formatAuthors(book.authors);
  detailMeta.textContent = formatDetailMeta(book);
  detailYear.textContent = book.firstPublishYear || "-";
  readingNowInput.checked = Boolean(book.readingNow && !isBookCompleted(book));
  readDateInput.value = book.readDate || "";
  readDateUnknownInput.checked = Boolean(book.completedWithoutDate && !book.readDate);
  syncReadDateControls();
  reviewText.value = book.review || "";

  detailCoverWrap.replaceChildren(createCoverElement(book, "detail-cover"));
  updateDetailDraftState();

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  }
}

async function saveActiveBook() {
  if (!activeBookId) return;

  const targetBookId = activeBookId;
  const nextPatch = {
    readingNow: !readDateInput.value && !readDateUnknownInput.checked && readingNowInput.checked,
    readDate: readDateInput.value,
    completedWithoutDate: !readDateInput.value && readDateUnknownInput.checked,
    review: reviewText.value.trim(),
  };

  if (currentUser) {
    try {
      const savedBook = await updateRemoteBook(targetBookId, nextPatch);
      shelfBooks = shelfBooks.map((book) => (book.id === targetBookId ? savedBook : book));
      renderShelf();
      return;
    } catch (error) {
      setStatus("서버에 독서 기록을 저장하지 못했습니다.");
      return;
    }
  }

  shelfBooks = shelfBooks.map((book) => {
    if (book.id !== targetBookId) return book;
    return {
      ...book,
      ...nextPatch,
    };
  });

  persistShelf();
  renderShelf();
}

function createCoverElement(book, className) {
  const coverUrl = getCoverUrl(book, className === "detail-cover" ? "L" : "M");

  if (!coverUrl) {
    const fallback = document.createElement("div");
    fallback.className = `fallback-cover ${className}`;
    fallback.textContent = book.title;
    return fallback;
  }

  const image = document.createElement("img");
  image.className = className;
  image.src = coverUrl;
  image.alt = `${book.title} 표지`;
  image.loading = "lazy";
  return image;
}

function getCoverUrl(book, size) {
  if (book.coverUrl) {
    return book.coverUrl;
  }

  if (book.coverId) {
    return `https://covers.openlibrary.org/b/id/${book.coverId}-${size}.jpg`;
  }

  if (book.isbn) {
    return `https://covers.openlibrary.org/b/isbn/${book.isbn}-${size}.jpg`;
  }

  return "";
}

function formatAuthors(authors) {
  return authors.length ? authors.join(", ") : "작가 정보 없음";
}

function formatResultMeta(book) {
  const published = book.firstPublishYear ? `${book.firstPublishYear}년 출간` : "출간 연도 정보 없음";
  return book.sourceLabel ? `${published} · ${book.sourceLabel}` : published;
}

function formatDetailMeta(book) {
  const published = book.firstPublishYear ? `${book.firstPublishYear}년 출간` : "출간 연도 정보 없음";
  return book.sourceLabel ? `${published} · ${book.sourceLabel}` : published;
}

function getRecordProgress(book) {
  if (isBookCompleted(book)) return 100;
  if (book.readingNow) return 50;
  return 0;
}

function getBookState(book) {
  if (isBookCompleted(book) && book.review) return "완독 기록";
  if (book.readDate) return "완독";
  if (book.completedWithoutDate) return "날짜 없이 완독";
  if (book.readingNow) return "읽는 중";
  if (book.review) return "독서 기록";
  return "기록 전";
}

function isBookCompleted(book) {
  return Boolean(book.readDate || book.completedWithoutDate);
}

function syncReadDateControls() {
  readDateInput.disabled = readDateUnknownInput.checked;
}

function updateDetailDraftState() {
  const reviewLength = reviewText.value.trim().length;
  detailReadState.textContent = getDraftReadStateText();
  detailReviewState.textContent = `${reviewLength}자`;
  detailNoteCount.textContent = `${reviewLength}자`;
}

function getDraftReadStateText() {
  if (readingNowInput.checked) return "읽는 중";
  if (readDateInput.value) return formatKoreanDate(readDateInput.value);
  if (readDateUnknownInput.checked) return "완독";
  return "미기록";
}

function formatKoreanDate(value) {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${Number(month)}.${Number(day)}`;
}

function setStatus(message) {
  statusLine.textContent = message;
}

function getSearchSuccessMessage() {
  if (lastSearchSources.googleBooks && lastSearchSources.openLibrary) {
    return "Google Books와 Open Library 결과를 함께 보여줍니다. 책을 클릭하면 내 서재에 추가됩니다.";
  }

  if (lastSearchSources.googleBooks) {
    return "Google Books 결과를 보여줍니다. 책을 클릭하면 내 서재에 추가됩니다.";
  }

  return "Open Library 결과를 넓혀 보여줍니다. Google Books API 키를 설정하면 검색 범위를 더 확장할 수 있습니다.";
}

function renderAuthState() {
  const isAuthenticated = Boolean(currentUser);

  loginLink.hidden = isAuthenticated;
  logoutButton.hidden = !isAuthenticated;
  authUser.hidden = !isAuthenticated;
  authUser.textContent = currentUser?.nickname || "로그인됨";
}

async function fetchCurrentUser() {
  const response = await fetch("/api/me", { cache: "no-store" });
  if (!response.ok) return null;
  return response.json();
}

async function fetchRemoteShelf() {
  const data = await requestJson("/api/books");
  return Array.isArray(data.books) ? data.books : [];
}

async function createRemoteBook(book) {
  const data = await requestJson("/api/books", {
    method: "POST",
    body: JSON.stringify(book),
  });
  return data.book;
}

async function updateRemoteBook(bookId, patch) {
  const data = await requestJson(`/api/books?id=${encodeURIComponent(bookId)}`, {
    method: "PATCH",
    body: JSON.stringify({ id: bookId, ...patch }),
  });
  return data.book;
}

async function deleteRemoteBook(bookId) {
  await requestJson(`/api/books?id=${encodeURIComponent(bookId)}`, {
    method: "DELETE",
  });
}

async function importGuestShelf() {
  const guestBooks = readShelf();
  if (!guestBooks.length) return;

  const results = await Promise.allSettled(guestBooks.map((book) => createRemoteBook(book)));
  if (results.every((result) => result.status === "fulfilled")) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || "Request failed");
    error.status = response.status;
    throw error;
  }

  return data;
}

function readShelf() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    return [];
  }
}

function persistShelf() {
  if (currentUser) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(shelfBooks));
}
