-- Checks for due study reminders every 10 minutes; keeps the log to two weeks.
-- node tools/fill-cron-sql.mjs writes 03_eng_cron.local.sql (git-ignored) with the project URL and the
-- planner's cron secret filled in.
select cron.unschedule(jobname) from cron.job where jobname in ('eng-reminders', 'eng-cleanup');

select cron.schedule('eng-reminders', '*/10 * * * *', $$
  select net.http_post(
    url     := '__PROJECT_URL__/functions/v1/eng-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '__CRON_SECRET__'),
    body    := '{}'::jsonb
  );
$$);

select cron.schedule('eng-cleanup', '23 4 * * *', $$
  delete from public.eng_remind_log where day < (now() at time zone 'Asia/Seoul')::date - 14;
$$);
