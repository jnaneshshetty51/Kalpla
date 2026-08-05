-- Function to atomically increment feature usage in subscriptions.usage_this_period
create or replace function public.increment_subscription_usage(
  p_user_id uuid,
  p_feature_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_usage jsonb;
begin
  insert into public.subscriptions (user_id, tier, status, usage_this_period)
  values (
    p_user_id,
    'free',
    'active',
    jsonb_build_object(p_feature_key, 1)
  )
  on conflict (user_id) do update set
    usage_this_period = jsonb_set(
      coalesce(public.subscriptions.usage_this_period, '{}'::jsonb),
      array[p_feature_key],
      to_jsonb(
        coalesce((public.subscriptions.usage_this_period->>p_feature_key)::int, 0) + 1
      ),
      true
    ),
    updated_at = now()
  returning usage_this_period into v_new_usage;

  return v_new_usage;
end;
$$;

comment on function public.increment_subscription_usage is 'Atomically increments a feature usage counter in subscriptions.usage_this_period.';

-- Postgres grants EXECUTE on new functions to PUBLIC by default, and this
-- project doesn't override that default — verified anon/authenticated can
-- currently execute every function in public, including SECURITY DEFINER
-- ones. Unlike is_admin() (takes no args, can only ever answer for the
-- caller's own auth.uid()), this function takes an arbitrary p_user_id and
-- bypasses RLS: left at the default grant, any authenticated user could
-- call it directly via RPC to tamper with another user's subscription
-- usage counters. It's only ever meant to be called by trusted server code
-- via the service-role admin client, so restrict it to that.
revoke execute on function public.increment_subscription_usage(uuid, text) from public;
grant execute on function public.increment_subscription_usage(uuid, text) to service_role;
