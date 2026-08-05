-- The previous migration's `revoke execute ... from public` didn't actually
-- lock this down: this project has default privileges configured on the
-- public schema that grant EXECUTE directly to anon and authenticated on
-- every new function (confirmed via information_schema.routine_privileges),
-- not just via the PUBLIC pseudo-role. Revoking from PUBLIC alone left
-- those direct grants untouched. Revoke from the actual grantees this time.
revoke execute on function public.increment_subscription_usage(uuid, text) from anon, authenticated;
