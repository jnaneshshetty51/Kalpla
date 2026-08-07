-- Prompt 79: daily coach nudge emails are opt-out, default on, with a
-- clear unsubscribe link that flips this back off.
alter table public.users
  add column email_notifications_enabled boolean not null default true;
