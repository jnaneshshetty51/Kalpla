-- Prompt 63: submission reviews need to flow into the same review queue
-- assessment attempts use (Prompt 25). The queue was attempt-only
-- (attempt_id not null); make it accept either target, mirroring the
-- "exactly one of" pattern already used on public.submissions.
alter table public.grading_review_queue
  alter column attempt_id drop not null;

alter table public.grading_review_queue
  add column submission_id uuid references public.submissions (id) on delete cascade;

alter table public.grading_review_queue
  add constraint grading_review_queue_exactly_one_target check (
    (attempt_id is not null and submission_id is null)
    or (attempt_id is null and submission_id is not null)
  );

create index grading_review_queue_submission_id_idx on public.grading_review_queue (submission_id);
