-- Lesson content for a skill node. Versioned so content can be revised
-- without losing what earlier learners saw.

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  skill_node_id uuid not null references public.skill_nodes (id) on delete cascade,
  content text not null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (skill_node_id, version)
);

comment on column public.lessons.content is 'Markdown.';

create trigger set_lessons_updated_at
  before update on public.lessons
  for each row execute function public.set_updated_at();

create index lessons_skill_node_id_idx on public.lessons (skill_node_id);

alter table public.lessons enable row level security;

create policy "Authenticated users can view lessons"
  on public.lessons for select
  to authenticated
  using (true);

create policy "Admins have full access to lessons"
  on public.lessons for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
