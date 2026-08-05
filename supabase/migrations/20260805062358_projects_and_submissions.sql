-- Project catalog (admin-managed) and user submissions against either a
-- catalog project or an assessment_tasks exercise.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tier text not null check (tier in ('free', 'pro', 'premium')),
  spec jsonb not null default '{}',
  starter_template text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create index projects_tier_idx on public.projects (tier);

alter table public.projects enable row level security;

create policy "Authenticated users can view projects"
  on public.projects for select
  to authenticated
  using (true);

create policy "Admins have full access to projects"
  on public.projects for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- A submission is against exactly one of: a catalog project, or a standalone
-- assessment_tasks exercise (no "exercises" table exists separately in this
-- schema — assessment_tasks fills that role).

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  exercise_id uuid references public.assessment_tasks (id) on delete cascade,
  code text not null,
  ai_review jsonb,
  status text not null default 'pending' check (status in ('pending', 'in_review', 'passed', 'failed', 'needs_revision')),
  created_at timestamptz not null default now(),
  constraint submissions_exactly_one_target check (
    (project_id is not null and exercise_id is null)
    or (project_id is null and exercise_id is not null)
  )
);

create index submissions_user_id_idx on public.submissions (user_id);
create index submissions_project_id_idx on public.submissions (project_id);
create index submissions_exercise_id_idx on public.submissions (exercise_id);
create index submissions_status_idx on public.submissions (status);

alter table public.submissions enable row level security;

-- Like assessment_attempts: ai_review/status are filled in by a trusted
-- server-side grading process, so users get select + insert but not update.
create policy "Users can view own submissions"
  on public.submissions for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can create own submissions"
  on public.submissions for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Admins have full access to submissions"
  on public.submissions for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
