-- Read-only security inspection; no real names, balances, credentials or purchases in output.
select tablename,rowsecurity from pg_tables where schemaname='public' order by tablename;
select p.proname,p.prosecdef,p.proconfig,
 has_function_privilege('anon',p.oid,'execute') anonymous_execute,
 has_function_privilege('authenticated',p.oid,'execute') authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('app_snapshot','export_snapshot','confirm_purchase','cancel_purchase','initial_import','admin_participant','admin_product','admin_event','admin_profile') order by p.proname;
select schemaname,tablename,policyname,roles,cmd from pg_policies where schemaname='public' order by tablename;
select count(*) participant_count from public.participants;
select count(*) product_count from public.products;
select count(*) purchase_count from public.purchases;
select pubname,tablename from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' order by tablename;
