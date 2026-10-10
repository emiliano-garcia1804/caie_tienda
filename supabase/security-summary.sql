select jsonb_build_object(
 'tables',(select jsonb_agg(jsonb_build_object('name',tablename,'rls',rowsecurity)) from pg_tables where schemaname='public'),
 'functions',(select jsonb_agg(jsonb_build_object('name',p.proname,'security_definer',p.prosecdef,'settings',p.proconfig,'anonymous_execute',has_function_privilege('anon',p.oid,'execute'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'execute'))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('app_snapshot','export_snapshot','confirm_purchase','cancel_purchase','initial_import','admin_participant','admin_product','admin_event','admin_profile')),
 'policies',(select jsonb_agg(jsonb_build_object('table',tablename,'command',cmd,'roles',roles)) from pg_policies where schemaname='public'),
 'counts',jsonb_build_object('participants',(select count(*) from public.participants),'products',(select count(*) from public.products),'purchases',(select count(*) from public.purchases)),
 'realtime',(select jsonb_agg(tablename) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public')
) result;
