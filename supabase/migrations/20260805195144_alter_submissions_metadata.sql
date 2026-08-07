-- Section G/H need a flexible place to record per-submission signals that
-- don't warrant their own columns: hint usage leading up to this submission
-- (Prompt 56), test pass/fail state at submit time (Prompt 59), and
-- re-review clarification requests (Prompt 64).
alter table public.submissions
  add column metadata jsonb not null default '{}'::jsonb;

comment on column public.submissions.metadata is
  'Flexible per-submission signals: hints_used, test_results, re_review_requests, confidence.';
