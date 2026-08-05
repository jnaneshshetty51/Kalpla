-- Profile table extending auth.users, plus the role/admin infrastructure
-- that every later migration's RLS policies depend on.

create type public.user_role as enum ('user', 'admin');
create type public.experience_level as enum ('beginner', 'intermediate', 'advanced');

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  goal text,
  experience_level public.experience_level,
  time_budget_minutes_per_day integer check (time_budget_minutes_per_day > 0),
  timeline_days integer check (timeline_days > 0),
  role public.user_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.users is 'Profile data extending auth.users. Row is created automatically by handle_new_user() on signup.';

-- Generic updated_at maintenance, reused by every later migration.
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- Auto-create the profile row when a new auth user signs up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'user_name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Admin check used by every RLS policy in this schema. SECURITY DEFINER +
-- pinned search_path so it always works regardless of the caller's own
-- privileges and can't be tricked via search_path hijacking.
create function public.is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin'
  );
$$;

comment on function public.is_admin is 'True if the currently authenticated user has role = admin. Used by RLS policies across all tables.';

alter table public.users enable row level security;

create policy "Users can view own profile"
  on public.users for select
  to authenticated
  using (id = auth.uid());

create policy "Users can insert own profile"
  on public.users for insert
  to authenticated
  with check (id = auth.uid());

create policy "Users can update own profile"
  on public.users for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "Admins have full access to users"
  on public.users for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- RLS filters rows, not columns, so the "update own profile" policy above
-- would otherwise let a user set their own role to admin. A column-level
-- GRANT restriction can't fix this: admins share the same `authenticated`
-- Postgres role as regular users, so revoking column access would block
-- admins too. A trigger that compares old/new is the only way to allow
-- "admin can change anyone's role" while blocking "user changes own role".
create function public.prevent_role_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only admins can change role';
  end if;
  return new;
end;
$$;

create trigger enforce_role_change_admin_only
  before update of role on public.users
  for each row execute function public.prevent_role_self_escalation();
