-- Apply after 001 as postgres. Supabase pg_cron executes in the database while browsers are closed.
create extension if not exists pg_cron;
select cron.schedule('kalling-foundation-worker','* * * * *','select kalling_private.tick();');
-- The free plan can pause inactive projects. This is not a keep-alive or uptime guarantee.
-- Bound pg_cron run logs for this specific task; never modify another application's records.
select cron.schedule('kalling-foundation-log-retention','0 3 * * *',
 $$delete from cron.job_run_details where jobid in (select jobid from cron.job where jobname in ('kalling-foundation-worker','kalling-foundation-log-retention')) and start_time<now()-interval '7 days'$$);
