-- Billing state, synced from Stripe via webhook (service_role), one row per
-- user. Status values mirror Stripe subscription statuses directly.

create table public.subscriptions (
  user_id uuid primary key references public.users (id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'pro', 'premium')),
  status text not null default 'active' check (
    status in ('active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired')
  ),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  usage_this_period jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

create index subscriptions_status_idx on public.subscriptions (status);

alter table public.subscriptions enable row level security;

-- Billing state is only ever written by the Stripe webhook handler
-- (service_role) — users can view their own plan/usage but not edit it
-- directly, otherwise they could grant themselves a paid tier for free.
create policy "Users can view own subscription"
  on public.subscriptions for select
  to authenticated
  using (user_id = auth.uid());

create policy "Admins have full access to subscriptions"
  on public.subscriptions for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
