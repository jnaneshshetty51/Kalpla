-- Admin-scheduled live video sessions (weekly classes, biweekly architecture
-- sessions, weekly office hours, and 1:1 mock interviews). Cohort-wide
-- session types are visible to every authenticated user — there is no
-- cohort/enrollment table anywhere in this schema to gate against.
-- mock_interview sessions are 1:1, scoped to a single assigned student via
-- assigned_user_id.
create table public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  session_type text not null check (session_type in
    ('live_class', 'architecture_session', 'office_hours', 'mock_interview')),
  starts_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes > 0),
  assigned_user_id uuid references public.users (id) on delete cascade,
  daily_room_name text not null,
  daily_room_url text not null,
  reminder_sent_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid not null references public.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mock_interview_requires_assignee check (
    (session_type = 'mock_interview' and assigned_user_id is not null) or
    (session_type <> 'mock_interview' and assigned_user_id is null)
  )
);

comment on table public.live_sessions is 'Admin-scheduled embedded video sessions. Cohort-wide types are visible to all users; mock_interview is 1:1 via assigned_user_id.';

create trigger set_live_sessions_updated_at
  before update on public.live_sessions
  for each row execute function public.set_updated_at();

create index live_sessions_starts_at_idx on public.live_sessions (starts_at);
create index live_sessions_assigned_user_id_idx on public.live_sessions (assigned_user_id);

alter table public.live_sessions enable row level security;

-- Cohort-wide session types have no enrollment table to gate against, so
-- every authenticated user can see them.
create policy "Users can view cohort-wide live sessions"
  on public.live_sessions for select
  to authenticated
  using (session_type <> 'mock_interview');

create policy "Users can view their own assigned mock interviews"
  on public.live_sessions for select
  to authenticated
  using (session_type = 'mock_interview' and assigned_user_id = auth.uid());

create policy "Admins have full access to live sessions"
  on public.live_sessions for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
