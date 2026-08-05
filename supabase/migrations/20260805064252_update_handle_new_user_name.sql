-- 20260805062347_users.sql's handle_new_user() was edited locally after it
-- had already been pushed and recorded in the remote migration history;
-- editing a past migration file doesn't retroactively change a database
-- that already applied it. This migration carries that edit (populate
-- `name` from signup metadata) forward as a proper new migration.

create or replace function public.handle_new_user()
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
