-- Public-facing showcase page. One per user (primary key is user_id).

create table public.portfolios (
  user_id uuid primary key references public.users (id) on delete cascade,
  slug text not null unique,
  is_public boolean not null default false,
  published_projects uuid[] not null default '{}',
  bio text,
  custom_content jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.portfolios.published_projects is 'submissions.id values this user has chosen to showcase. Validated by validate_published_projects trigger to belong to the same user.';

create trigger set_portfolios_updated_at
  before update on public.portfolios
  for each row execute function public.set_updated_at();

-- Enforces the array "foreign key" and, importantly, that a user can only
-- showcase their own submissions.
create function public.check_published_projects_ownership()
returns trigger
language plpgsql
as $$
declare
  invalid_count integer;
begin
  if new.published_projects = '{}' then
    return new;
  end if;

  select count(*) into invalid_count
  from unnest(new.published_projects) as submission_id
  where not exists (
    select 1 from public.submissions
    where id = submission_id and user_id = new.user_id
  );

  if invalid_count > 0 then
    raise exception 'published_projects contains % submission id(s) not owned by this user', invalid_count;
  end if;

  return new;
end;
$$;

create trigger validate_published_projects
  before insert or update of published_projects on public.portfolios
  for each row execute function public.check_published_projects_ownership();

create index portfolios_public_idx on public.portfolios (is_public) where is_public = true;

alter table public.portfolios enable row level security;

create policy "Users can view own portfolio"
  on public.portfolios for select
  to authenticated
  using (user_id = auth.uid());

-- The whole point of is_public: visible to anyone, logged in or not.
create policy "Anyone can view public portfolios"
  on public.portfolios for select
  to anon, authenticated
  using (is_public = true);

create policy "Users can create own portfolio"
  on public.portfolios for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own portfolio"
  on public.portfolios for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete own portfolio"
  on public.portfolios for delete
  to authenticated
  using (user_id = auth.uid());

create policy "Admins have full access to portfolios"
  on public.portfolios for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
