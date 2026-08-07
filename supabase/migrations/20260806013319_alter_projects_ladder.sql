-- Prompt 67: the /projects page shows a 3-tier ladder (Prompt Playground ->
-- RAG Chatbot -> Tool-Using Agent) unlocked by roadmap progress, not by
-- projects.tier (that's a subscription tier, unrelated to ladder ordering).
alter table public.projects
  add column ladder_position integer,
  add column prerequisite_skill_node_ids uuid[] not null default '{}';

comment on column public.projects.ladder_position is
  'Position in the public project ladder (1, 2, 3, ...). Null for non-ladder / exercise-style projects.';
comment on column public.projects.prerequisite_skill_node_ids is
  'skill_nodes that must be completed (roadmap status = completed) before this project unlocks.';

create index projects_ladder_position_idx on public.projects (ladder_position) where ladder_position is not null;
