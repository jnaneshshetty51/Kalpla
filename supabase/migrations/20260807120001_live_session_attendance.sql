-- Real attendance log for live sessions, written server-side only (at
-- meeting-token issuance in the join API route) — never client-reported.
-- Replaces the manually-logged "Live session attendance" spreadsheet
-- column described in docs/pilot-launch/operational/10-outcomes-tracking-template.md
-- with a real, queryable table.
create table public.live_session_attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role_at_join text not null check (role_at_join in ('admin', 'student')),
  joined_at timestamptz not null default now(),
  unique (session_id, user_id)
);

comment on table public.live_session_attendance is 'Real per-user attendance record for live_sessions, written server-side at join-token issuance.';

create index live_session_attendance_session_id_idx on public.live_session_attendance (session_id);
create index live_session_attendance_user_id_idx on public.live_session_attendance (user_id);

alter table public.live_session_attendance enable row level security;

-- No insert policy for authenticated users: attendance rows are only ever
-- written server-side via the service-role client, so there is no
-- client-side path to spoof a join.
create policy "Users can view own attendance"
  on public.live_session_attendance for select
  to authenticated
  using (user_id = auth.uid());

create policy "Admins have full access to live session attendance"
  on public.live_session_attendance for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
