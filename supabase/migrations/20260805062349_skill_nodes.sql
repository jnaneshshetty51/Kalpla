-- Curriculum graph: individual skills, each optionally depending on others.

create table public.skill_nodes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  description text,
  prerequisite_ids uuid[] not null default '{}',
  -- 1 (easiest) .. 5 (hardest).
  difficulty smallint not null check (difficulty between 1 and 5),
  order_index integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.skill_nodes.prerequisite_ids is 'skill_nodes.id values that must be completed first. Postgres has no native array FK; validated by validate_prerequisite_ids trigger instead.';

create trigger set_skill_nodes_updated_at
  before update on public.skill_nodes
  for each row execute function public.set_updated_at();

-- Enforces the array "foreign key": every id must exist, and a node can't
-- list itself as its own prerequisite.
create function public.check_prerequisite_ids_exist()
returns trigger
language plpgsql
as $$
declare
  missing_count integer;
begin
  if new.prerequisite_ids = '{}' then
    return new;
  end if;

  if new.id = any (new.prerequisite_ids) then
    raise exception 'a skill_node cannot list itself as a prerequisite';
  end if;

  select count(*) into missing_count
  from unnest(new.prerequisite_ids) as prereq_id
  where not exists (select 1 from public.skill_nodes where id = prereq_id);

  if missing_count > 0 then
    raise exception 'prerequisite_ids references % non-existent skill_node id(s)', missing_count;
  end if;

  return new;
end;
$$;

create trigger validate_prerequisite_ids
  before insert or update of prerequisite_ids on public.skill_nodes
  for each row execute function public.check_prerequisite_ids_exist();

create index skill_nodes_category_idx on public.skill_nodes (category);
create index skill_nodes_order_index_idx on public.skill_nodes (order_index);
create index skill_nodes_prerequisite_ids_idx on public.skill_nodes using gin (prerequisite_ids);

alter table public.skill_nodes enable row level security;

-- Curriculum catalog: every signed-in user can read it, only admins edit it.
create policy "Authenticated users can view skill nodes"
  on public.skill_nodes for select
  to authenticated
  using (true);

create policy "Admins have full access to skill nodes"
  on public.skill_nodes for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
