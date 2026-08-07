-- Prompt 71: project submissions require a short written reflection
-- alongside the code, both passed to the AI reviewer together.
alter table public.submissions
  add column reflection text;
