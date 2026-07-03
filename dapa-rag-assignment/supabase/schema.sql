create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm;

create table if not exists public.dapa_rag_assignment_chunks (
  id bigserial primary key,
  document_id text not null,
  chunk_id integer not null,
  title text not null,
  section_path text[] not null default '{}',
  content text not null,
  token_estimate integer not null,
  source_url text,
  metadata jsonb not null default '{}'::jsonb,
  embedding extensions.vector(1024) not null,
  fts tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))
  ) stored,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_id)
);

create index if not exists dapa_rag_assignment_chunks_embedding_hnsw
  on public.dapa_rag_assignment_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

create index if not exists dapa_rag_assignment_chunks_fts_idx
  on public.dapa_rag_assignment_chunks
  using gin (fts);

create index if not exists dapa_rag_assignment_chunks_metadata_idx
  on public.dapa_rag_assignment_chunks
  using gin (metadata);

create or replace function public.dapa_rag_assignment_match_chunks(
  query_embedding extensions.vector(1024),
  match_count integer default 12,
  match_threshold double precision default 0.10
)
returns table (
  id bigint,
  document_id text,
  chunk_id integer,
  title text,
  section_path text[],
  content text,
  source_url text,
  metadata jsonb,
  similarity double precision
)
language sql
stable
as $$
  select
    c.id,
    c.document_id,
    c.chunk_id,
    c.title,
    c.section_path,
    c.content,
    c.source_url,
    c.metadata,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.dapa_rag_assignment_chunks c
  where 1 - (c.embedding <=> query_embedding) >= match_threshold
  order by c.embedding <=> query_embedding
  limit least(match_count, 50);
$$;

create or replace function public.dapa_rag_assignment_keyword_chunks(
  query_text text,
  match_count integer default 12
)
returns table (
  id bigint,
  document_id text,
  chunk_id integer,
  title text,
  section_path text[],
  content text,
  source_url text,
  metadata jsonb,
  keyword_rank real
)
language sql
stable
as $$
  select
    c.id,
    c.document_id,
    c.chunk_id,
    c.title,
    c.section_path,
    c.content,
    c.source_url,
    c.metadata,
    ts_rank(c.fts, plainto_tsquery('simple', query_text)) as keyword_rank
  from public.dapa_rag_assignment_chunks c
  where c.fts @@ plainto_tsquery('simple', query_text)
     or c.content % query_text
     or c.title % query_text
  order by keyword_rank desc, similarity(c.content, query_text) desc
  limit least(match_count, 50);
$$;
