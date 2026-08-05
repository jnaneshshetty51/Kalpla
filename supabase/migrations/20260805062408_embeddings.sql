-- Enable vector extension
create extension if not exists vector with schema extensions;

-- Embeddings table for platform tutor content and user RAG chatbot projects
create table public.embeddings (
  id uuid primary key default gen_random_uuid(),
  content_type text not null,
  content_id text,
  embedding vector(1536) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.embeddings is 'Vector embeddings table for platform tutor content retrieval and user RAG chatbot projects.';

-- Trigger for updated_at column maintenance
create trigger set_embeddings_updated_at
  before update on public.embeddings
  for each row execute function public.set_updated_at();

-- HNSW index for fast vector cosine similarity search
create index embeddings_embedding_hnsw_idx
  on public.embeddings using hnsw (embedding vector_cosine_ops);

-- Index on content_type for filtered queries
create index embeddings_content_type_idx
  on public.embeddings (content_type);

-- Enable Row Level Security (RLS)
alter table public.embeddings enable row level security;

-- Policies for public.embeddings
create policy "Authenticated users can select embeddings"
  on public.embeddings for select
  to authenticated
  using (true);

create policy "Authenticated users can insert embeddings"
  on public.embeddings for insert
  to authenticated
  with check (true);

create policy "Admins have full access to embeddings"
  on public.embeddings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Postgres RPC function for similarity search using pgvector's cosine distance operator (<=>)
create or replace function public.match_embeddings(
  query_embedding vector(1536),
  match_threshold float default 0.0,
  match_count int default 10,
  filter_content_type text default null
)
returns table (
  id uuid,
  content_type text,
  content_id text,
  metadata jsonb,
  similarity float
)
language plpgsql
stable
as $$
begin
  return query
  select
    e.id,
    e.content_type,
    e.content_id,
    e.metadata,
    (1 - (e.embedding <=> query_embedding))::float as similarity
  from public.embeddings e
  where (filter_content_type is null or e.content_type = filter_content_type)
    and (1 - (e.embedding <=> query_embedding)) >= match_threshold
  order by e.embedding <=> query_embedding
  limit match_count;
end;
$$;

comment on function public.match_embeddings is 'Performs cosine similarity search using pgvector operator (<=>).';
