-- A generated learning path for a user: an ordered list of skill nodes with
-- a status per node. Each regeneration inserts a new row so history is kept;
-- node status (e.g. marking one complete) is updated in place.

create table public.roadmaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  generated_at timestamptz not null default now(),
  -- Ordered array of objects, e.g.
  -- [{"skill_node_id": "...", "order": 0, "status": "locked|available|in_progress|completed"}, ...]
  nodes jsonb not null default '[]'
);

create index roadmaps_user_id_idx on public.roadmaps (user_id);
create index roadmaps_user_generated_idx on public.roadmaps (user_id, generated_at desc);
create index roadmaps_nodes_idx on public.roadmaps using gin (nodes jsonb_path_ops);

alter table public.roadmaps enable row level security;

create policy "Users can view own roadmaps"
  on public.roadmaps for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can create own roadmaps"
  on public.roadmaps for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own roadmaps"
  on public.roadmaps for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete own roadmaps"
  on public.roadmaps for delete
  to authenticated
  using (user_id = auth.uid());

create policy "Admins have full access to roadmaps"
  on public.roadmaps for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
