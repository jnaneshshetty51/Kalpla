-- One row per user per day: the day's assigned tasks and completion state.

create table public.daily_coach_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  date date not null,
  tasks jsonb not null default '[]',
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create trigger set_daily_coach_logs_updated_at
  before update on public.daily_coach_logs
  for each row execute function public.set_updated_at();

create index daily_coach_logs_user_date_idx on public.daily_coach_logs (user_id, date desc);

alter table public.daily_coach_logs enable row level security;

create policy "Users can view own daily coach logs"
  on public.daily_coach_logs for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can create own daily coach logs"
  on public.daily_coach_logs for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own daily coach logs"
  on public.daily_coach_logs for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete own daily coach logs"
  on public.daily_coach_logs for delete
  to authenticated
  using (user_id = auth.uid());

create policy "Admins have full access to daily coach logs"
  on public.daily_coach_logs for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
