-- AI tutor chat history for a user, optionally scoped to a skill node.

create table public.tutor_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  skill_node_id uuid references public.skill_nodes (id) on delete set null,
  -- Ordered array of {"role": "user|assistant", "content": "...", ...}.
  messages jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_tutor_conversations_updated_at
  before update on public.tutor_conversations
  for each row execute function public.set_updated_at();

create index tutor_conversations_user_id_idx on public.tutor_conversations (user_id);
create index tutor_conversations_skill_node_id_idx on public.tutor_conversations (skill_node_id);

alter table public.tutor_conversations enable row level security;

create policy "Users can view own tutor conversations"
  on public.tutor_conversations for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can create own tutor conversations"
  on public.tutor_conversations for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own tutor conversations"
  on public.tutor_conversations for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete own tutor conversations"
  on public.tutor_conversations for delete
  to authenticated
  using (user_id = auth.uid());

create policy "Admins have full access to tutor conversations"
  on public.tutor_conversations for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
