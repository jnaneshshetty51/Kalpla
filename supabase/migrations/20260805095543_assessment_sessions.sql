-- Persists incomplete assessment session state keyed by user
create table public.assessment_sessions (
  user_id uuid primary key references public.users (id) on delete cascade,
  current_index integer not null default 0 check (current_index >= 0),
  answers jsonb not null default '{}'::jsonb,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.assessment_sessions is 'Persisted mid-assessment state to allow resuming abandoned diagnostic sessions.';

create trigger set_assessment_sessions_updated_at
  before update on public.assessment_sessions
  for each row execute function public.set_updated_at();

alter table public.assessment_sessions enable row level security;

-- Policies for public.assessment_sessions
create policy "Users can view own assessment session"
  on public.assessment_sessions for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own assessment session"
  on public.assessment_sessions for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own assessment session"
  on public.assessment_sessions for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Admins have full access to assessment sessions"
  on public.assessment_sessions for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
