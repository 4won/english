-- Several reminders a day: the learner's chosen time plus the 21:00 / 22:00 / 23:00 "not done yet" nudges.
-- Each (person, day, slot) is sent once.
alter table public.eng_remind_log add column if not exists slot text not null default 'pick';
alter table public.eng_remind_log drop constraint if exists eng_remind_log_pkey;
alter table public.eng_remind_log add primary key (user_id, day, slot);
