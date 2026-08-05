-- Per-request AI usage/cost ledger, written by trusted server code only.

create table public.cost_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  feature text not null,
  model text not null,
  tokens_in integer not null default 0 check (tokens_in >= 0),
  tokens_out integer not null default 0 check (tokens_out >= 0),
  cost_usd numeric(10, 6) not null default 0 check (cost_usd >= 0),
  created_at timestamptz not null default now()
);

create index cost_logs_user_id_idx on public.cost_logs (user_id);
create index cost_logs_created_at_idx on public.cost_logs (created_at);
create index cost_logs_user_created_idx on public.cost_logs (user_id, created_at desc);
create index cost_logs_feature_idx on public.cost_logs (feature);

alter table public.cost_logs enable row level security;

-- Billing-relevant audit log: users can see their own usage/cost history for
-- transparency, but only server-side code (service_role) writes rows.
create policy "Users can view own cost logs"
  on public.cost_logs for select
  to authenticated
  using (user_id = auth.uid());

create policy "Admins have full access to cost logs"
  on public.cost_logs for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
