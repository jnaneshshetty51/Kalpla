-- Audit queue for low-confidence AI grades and schema validation failures
create table public.grading_review_queue (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.assessment_attempts (id) on delete cascade,
  reason text not null check (reason in ('low_confidence', 'schema_validation_failed', 'manual_flag')),
  details jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'resolved', 'dismissed')),
  reviewer_id uuid references public.users (id) on delete set null,
  reviewer_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.grading_review_queue is 'Admin review queue for low-confidence AI grades or schema validation failures.';

create trigger set_grading_review_queue_updated_at
  before update on public.grading_review_queue
  for each row execute function public.set_updated_at();

create index grading_review_queue_attempt_id_idx on public.grading_review_queue (attempt_id);
create index grading_review_queue_status_idx on public.grading_review_queue (status);
create index grading_review_queue_reason_idx on public.grading_review_queue (reason);

alter table public.grading_review_queue enable row level security;

-- Only admins can view or update review queue items directly
create policy "Admins have full access to grading review queue"
  on public.grading_review_queue for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
