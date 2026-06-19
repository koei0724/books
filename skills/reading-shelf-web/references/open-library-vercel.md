# Open Library, 저장, Vercel 메모

## Open Library 검색

간단한 정적 앱에서는 브라우저에서 공개 검색 엔드포인트를 직접 호출한다:

```text
https://openlibrary.org/search.json?q=<query>&limit=12&fields=key,title,author_name,first_publish_year,cover_i,isbn
```

각 결과는 방어적으로 정규화한다:

- `id`: `key`에 `/works/`가 있으면 제거한다.
- `title`: 필수 값이다. 제목이 없는 결과는 버린다.
- `authors`: `author_name`에서 최대 3명까지 사용한다.
- `firstPublishYear`: 값이 있으면 `first_publish_year`를 사용한다.
- `coverId`: 값이 있으면 `cover_i`를 사용한다.
- `isbn`: 표지 대체 경로로 첫 번째 ISBN을 사용한다.

## 표지 이미지

기본 표지 URL:

```text
https://covers.openlibrary.org/b/id/<coverId>-M.jpg
```

상세 화면용 큰 표지:

```text
https://covers.openlibrary.org/b/id/<coverId>-L.jpg
```

ISBN 대체 URL:

```text
https://covers.openlibrary.org/b/isbn/<isbn>-M.jpg
```

`coverId`와 `isbn`이 모두 없으면 책 제목을 넣은 CSS 대체 표지를 렌더링한다. 대체 표지는 실제 표지와 같은 `2 / 3` 비율을 유지해야 한다.

## 로컬 저장

백엔드가 없는 버전에서는 `localStorage`를 사용한다. 기존 프로젝트 키:

```text
reading-shelf.books.v1
```

정규화된 책 레코드 배열을 저장한다. 병합하거나 다시 렌더링할 때 사용자가 작성한 `readDate`와 `review` 값은 유지한다. 이 저장 방식은 브라우저/기기별 로컬 저장소이므로, 백엔드를 추가하지 않는 한 클라우드 동기화를 암시하지 않는다.

## Vercel 정적 배포

배포는 사용자가 명시적으로 요청한 경우에만 실행한다. 구현, 문서 작업, 내부 개발 검증이 끝났더라도 사용자가 배포를 요청하지 않았다면 `vercel`, `vercel deploy`, `vercel --prod` 같은 배포 명령을 실행하지 않는다. 이 경우 배포 준비 상태만 보고한다.

사용자가 배포를 요청하면 이 정적 프로젝트는 루트 디렉터리를 그대로 Vercel에 배포할 수 있다. 검증 산출물이 업로드되지 않도록 `.vercelignore`를 유지한다:

```text
.playwright-mcp
reading-shelf-*.png
.DS_Store
```

유용한 CLI 흐름:

```bash
vercel whoami
vercel --prod --yes --scope <target-scope>
```

배포 후에는 브라우저에서 프로덕션 URL을 확인하고 검색어 1개로 검색을 실행한다. 배포 과정에서 `.vercel/project.json`이 생성되면 이후 배포를 위해 남겨 두되, `.vercel`은 git ignore 상태를 유지한다.
