-- The original lessons table (20260805062355) only had a bare `content`
-- column and never actually held any rows (a later attempt to seed it with
-- title/content_markdown/code_example/discussion_questions failed outright
-- with "column does not exist" and rolled back). Nothing in the app reads
-- `content` — the lesson page, tutor chat, and admin editor all expect
-- `content_markdown` plus a title, a separated worked example, and
-- structured discussion questions. Since the table is empty, replace the
-- shape outright rather than carrying two parallel content columns forward.
alter table public.lessons
  drop column content;

alter table public.lessons
  add column title text not null default '',
  add column content_markdown text not null default '',
  add column code_example text,
  add column discussion_questions jsonb not null default '[]'::jsonb;

alter table public.lessons
  alter column title drop default,
  alter column content_markdown drop default;
