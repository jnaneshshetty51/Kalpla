-- Assessment tasks (catalog, admin-managed), user attempts at them, and the
-- resulting per-skill competency scores.

create table public.assessment_tasks (
  id uuid primary key default gen_random_uuid(),
  skill_node_id uuid not null references public.skill_nodes (id) on delete cascade,
  type text not null check (type in ('multiple_choice', 'short_answer', 'code', 'project')),
  prompt text not null,
  rubric jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_assessment_tasks_updated_at
  before update on public.assessment_tasks
  for each row execute function public.set_updated_at();

create index assessment_tasks_skill_node_id_idx on public.assessment_tasks (skill_node_id);
create index assessment_tasks_type_idx on public.assessment_tasks (type);

alter table public.assessment_tasks enable row level security;

create policy "Authenticated users can view assessment tasks"
  on public.assessment_tasks for select
  to authenticated
  using (true);

create policy "Admins have full access to assessment tasks"
  on public.assessment_tasks for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- A user's individual attempt at a task, and the AI grading result.

create table public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  task_id uuid not null references public.assessment_tasks (id) on delete cascade,
  response jsonb not null,
  -- 0-100.
  ai_score numeric(5, 2) check (ai_score between 0 and 100),
  ai_feedback jsonb,
  -- Model's confidence in its own grading, 0-1.
  confidence numeric(3, 2) check (confidence between 0 and 1),
  created_at timestamptz not null default now()
);

create index assessment_attempts_user_id_idx on public.assessment_attempts (user_id);
create index assessment_attempts_task_id_idx on public.assessment_attempts (task_id);
create index assessment_attempts_user_created_idx on public.assessment_attempts (user_id, created_at desc);

alter table public.assessment_attempts enable row level security;

-- Attempts are graded by a trusted server process (service_role), not the
-- user themselves — ai_score/ai_feedback/confidence must not be
-- user-editable after submission, so there is deliberately no UPDATE
-- policy for the authenticated role here.
create policy "Users can view own assessment attempts"
  on public.assessment_attempts for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can submit own assessment attempts"
  on public.assessment_attempts for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Admins have full access to assessment attempts"
  on public.assessment_attempts for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Current mastery per user per skill. Derived/aggregated from graded
-- attempts by a server process — not directly user-writable, same
-- reasoning as assessment_attempts' AI fields above.

create table public.competency_scores (
  user_id uuid not null references public.users (id) on delete cascade,
  skill_node_id uuid not null references public.skill_nodes (id) on delete cascade,
  -- 0-100.
  score numeric(5, 2) not null check (score between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, skill_node_id)
);

create trigger set_competency_scores_updated_at
  before update on public.competency_scores
  for each row execute function public.set_updated_at();

create index competency_scores_skill_node_id_idx on public.competency_scores (skill_node_id);

alter table public.competency_scores enable row level security;

create policy "Users can view own competency scores"
  on public.competency_scores for select
  to authenticated
  using (user_id = auth.uid());

create policy "Admins have full access to competency scores"
  on public.competency_scores for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
