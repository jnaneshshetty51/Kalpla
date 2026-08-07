-- Add role column to public.users table (default 'learner'; set to 'admin' manually for admin accounts)
alter table public.users
  add column if not exists role text not null default 'learner'
  check (role in ('learner', 'admin'));

-- Index for fast admin role checks in middleware
create index if not exists idx_users_role on public.users (role);
