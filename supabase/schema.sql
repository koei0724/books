create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  kakao_id text not null unique,
  nickname text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  book_key text not null,
  source text,
  source_label text,
  title text not null,
  authors jsonb not null default '[]'::jsonb,
  first_publish_year text,
  cover_id text,
  cover_url text,
  isbn text,
  added_at timestamptz not null default now(),
  reading_now boolean not null default false,
  read_date date,
  completed_without_date boolean not null default false,
  review text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists books_user_id_idx on public.books(user_id);
create unique index if not exists books_user_book_key_idx on public.books(user_id, book_key);

alter table public.app_users enable row level security;
alter table public.books enable row level security;
