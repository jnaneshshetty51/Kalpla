-- Semantic cache for the AI tutor (Prompt 51): before spending an
-- expensive-tier LLM call, check whether a similar enough question has
-- already been answered for this skill node. Reuses the same pgvector
-- extension and vector(1536)/cosine-distance convention established for
-- public.embeddings (20260805062408).
create table public.tutor_qa_cache (
  id uuid primary key default gen_random_uuid(),
  skill_node_id uuid not null references public.skill_nodes (id) on delete cascade,
  question_text text not null,
  question_embedding vector(1536) not null,
  answer_text text not null,
  hit_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_tutor_qa_cache_updated_at
  before update on public.tutor_qa_cache
  for each row execute function public.set_updated_at();

create index tutor_qa_cache_skill_node_id_idx on public.tutor_qa_cache (skill_node_id);

create index tutor_qa_cache_embedding_hnsw_idx
  on public.tutor_qa_cache using hnsw (question_embedding vector_cosine_ops);

alter table public.tutor_qa_cache enable row level security;

create policy "Authenticated users can read tutor QA cache"
  on public.tutor_qa_cache for select
  to authenticated
  using (true);

create policy "Admins have full access to tutor QA cache"
  on public.tutor_qa_cache for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Cache reads/writes go through the service-role admin client (same as
-- competency_scores et al.) since cache entries aren't owned by a single
-- user and shouldn't be self-reportable — no authenticated-role insert
-- policy is granted on purpose.

create or replace function public.match_tutor_qa_cache(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_skill_node_id uuid
)
returns table (
  id uuid,
  skill_node_id uuid,
  question_text text,
  answer_text text,
  hit_count int,
  similarity float
)
language plpgsql
stable
as $$
begin
  return query
  select
    tqc.id,
    tqc.skill_node_id,
    tqc.question_text,
    tqc.answer_text,
    tqc.hit_count,
    (1 - (tqc.question_embedding <=> query_embedding))::float as similarity
  from public.tutor_qa_cache tqc
  where tqc.skill_node_id = p_skill_node_id
    and (1 - (tqc.question_embedding <=> query_embedding)) >= match_threshold
  order by tqc.question_embedding <=> query_embedding
  limit match_count;
end;
$$;

comment on function public.match_tutor_qa_cache is 'Cosine similarity search over cached tutor Q&A pairs, scoped to one skill node.';
