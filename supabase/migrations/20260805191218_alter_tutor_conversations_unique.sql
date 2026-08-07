-- app/api/tutor/chat/route.ts and app/api/learn/[skill]/route.ts both
-- upsert/select tutor_conversations keyed by (user_id, skill_node_id),
-- expecting exactly one resumable conversation row per user per node. The
-- original migration (20260805062357) never added that constraint, so the
-- upsert's `onConflict: "user_id, skill_node_id"` currently errors at
-- runtime ("no unique or exclusion constraint matching the ON CONFLICT
-- specification"). Collapse any pre-existing duplicates (there shouldn't be
-- any live traffic yet, but be safe) before adding the constraint.
delete from public.tutor_conversations a
using public.tutor_conversations b
where a.user_id = b.user_id
  and a.skill_node_id = b.skill_node_id
  and a.ctid < b.ctid;

alter table public.tutor_conversations
  add constraint tutor_conversations_user_node_unique unique (user_id, skill_node_id);
