-- 20260805062408_embeddings.sql got applied to remote as a side effect of
-- `supabase db push` sweeping up all pending migrations (it applies
-- everything newer than the last-applied one; there's no way to push a
-- single file). That migration is otherwise out of scope for this pass —
-- it wasn't part of the current auth/middleware work — but it shipped with
-- `with check (true)` on INSERT for public.embeddings: any authenticated
-- user could write into a table with no user_id/ownership column at all,
-- i.e. pollute or overwrite the shared tutor-content knowledge base. That
-- gap is real regardless of scope, so closing it now rather than leaving
-- it live. Whether embeddings should also support per-user RAG content
-- (the table comment mentions this but the schema has no owner column for
-- it) is an open design question for whenever that feature is built.

drop policy "Authenticated users can insert embeddings" on public.embeddings;
