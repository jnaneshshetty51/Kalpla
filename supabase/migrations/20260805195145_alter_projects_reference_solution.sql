-- Prompt 58: "See an alternate approach" generates a reference
-- implementation once per project (expensive-tier, one-time) and caches it
-- here since the result isn't user-specific — every user who passes the
-- tests sees the same cached reference solution.
alter table public.projects
  add column reference_solution text,
  add column reference_solution_generated_at timestamptz;

-- Also used by the hint system (Prompt 56) to snapshot per-project
-- workspace hint requests before they're rolled into a submission's
-- metadata at submit time.
create table public.workspace_hints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  level integer not null check (level between 1 and 3),
  code_snapshot text,
  created_at timestamptz not null default now()
);

create index workspace_hints_user_project_idx on public.workspace_hints (user_id, project_id);

alter table public.workspace_hints enable row level security;

create policy "Users can view own workspace hints"
  on public.workspace_hints for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can create own workspace hints"
  on public.workspace_hints for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Admins have full access to workspace hints"
  on public.workspace_hints for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
