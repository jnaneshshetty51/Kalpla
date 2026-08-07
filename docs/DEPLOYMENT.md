# Kalpla Platform — Production Deployment Guide

This guide details environment setup, database migrations, and Vercel deployment instructions for launching Kalpla in production.

---

## 1. Environment Variables Checklist

Ensure the following environment variables are set in your Vercel Project Settings (**Settings > Environment Variables**):

| Variable Name | Environment | Description / Target Value | Required |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview, Dev | Supabase Project URL (`https://<project>.supabase.co`) | **Yes** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview, Dev | Supabase Anon Key (safe for client) | **Yes** |
| `SUPABASE_SERVICE_ROLE_KEY` | Production, Preview, Dev | Supabase Service Role Secret Key (Server-only) | **Yes** |
| `SUPABASE_DB_PASSWORD` | Production, Preview, Dev | Direct PostgreSQL Connection Password | Optional |
| `OPENAI_API_KEY` | Production, Preview, Dev | OpenAI API Key (embeddings & fallback LLM) | **Yes** |
| `ANTHROPIC_API_KEY` | Production, Preview, Dev | Anthropic API Key (Claude models) | **Yes** |
| `DEFAULT_LLM_PROVIDER` | Production, Preview, Dev | Primary provider choice (`anthropic` or `openai`) | **Yes** |
| `RESEND_API_KEY` | Production | Resend API Key for sending daily coach emails | **Yes** |
| `CRON_SECRET` | Production, Preview | Shared secret for Vercel Cron (`/api/cron/daily-coach`) | **Yes** |
| `STRIPE_SECRET_KEY` | Production, Preview | Stripe Secret Key (`sk_live_...` or `sk_test_...`) | **Yes** |
| `STRIPE_WEBHOOK_SECRET` | Production, Preview | Stripe Webhook Signing Secret (`whsec_...`) | **Yes** |
| `STRIPE_PRICE_ID_PRO` | Production, Preview | Stripe Price ID for Pro tier | **Yes** |
| `STRIPE_PRICE_ID_PREMIUM` | Production, Preview | Stripe Price ID for Premium tier | **Yes** |
| `NEXT_PUBLIC_SITE_URL` | Production | Absolute production origin (e.g. `https://kalpla.com`) | **Yes** |

---

## 2. Database Migrations & RLS Audit

All database schema migrations are maintained under `supabase/migrations/`.

To apply all migrations to your Supabase production database:

```bash
supabase db push
```

### Row-Level Security (RLS) Verification
- **All 16 tables** have RLS enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`).
- **User Data Isolation**: Tables (`users`, `tutor_conversations`, `roadmaps`, `submissions`, `competency_scores`, `assessment_attempts`, `portfolios`, `subscriptions`, `workspace_hints`) enforce `user_id = auth.uid()`.
- **System & Admin Tables**: `cost_logs`, `tutor_qa_cache`, and `grading_review_queue` are restricted to admin access (`is_admin()`) or service role server execution.
- **Curriculum Catalogs**: `skill_nodes`, `lessons`, and `assessment_tasks` permit read access for authenticated users, while write access requires admin role.

---

## 3. Promoting Admin Users

To grant admin privileges to an account:

```sql
UPDATE public.users SET role = 'admin' WHERE email = 'admin@example.com';
```

---

## 4. Vercel Cron Configuration

Vercel Cron jobs are defined in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/daily-coach",
      "schedule": "0 13 * * *"
    }
  ]
}
```

Vercel will send an HTTP POST with `Authorization: Bearer $CRON_SECRET` every day at 13:00 UTC.

---

## 5. Deployment Commands

### Production Deploy via CLI:
```bash
npx vercel --prod
```

### Smoke Test Critical Path (Post-Deploy Verification)
1. **Sign Up / Login**: Register a new user at `/signup`.
2. **Assessment**: Complete initial skill assessment at `/assessment`.
3. **Roadmap & Dashboard**: Verify custom roadmap generation on `/dashboard`.
4. **Lesson & Tutor**: Open `/learn/node-llm-basics`, read lesson, ask tutor question.
5. **Project Workspace**: Submit solution on `/workspace/proj-rag-chatbot`.
6. **Portfolio**: Generate case study and view public portfolio on `/portfolio`.
