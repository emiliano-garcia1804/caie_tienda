-- First stage: the owner explicitly authorized public reads and app operations.
-- A technical identity labels public movements; it has no login credentials.
create schema if not exists caie_private;
revoke all on schema caie_private from public, anon, authenticated;
create table caie_private.store_access (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 actor_id uuid not null references public.profiles(id)
);
alter table caie_private.store_access enable row level security;
revoke all on caie_private.store_access from public, anon, authenticated;

insert into auth.users(id) values('aaca1e00-0000-4000-8000-000000000001');
insert into public.profiles(id,display_name,role)
values('aaca1e00-0000-4000-8000-000000000001','Acceso público','admin');
insert into caie_private.store_access(singleton,enabled,actor_id)
values(true,true,'aaca1e00-0000-4000-8000-000000000001');

-- Dispatch only existing application operations. No dynamic SQL, arbitrary
-- actor selection, account management, direct table writes or secret keys.
create function public.open_store(p_operation text,p_params jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; result jsonb;
 prior_sub text:=current_setting('request.jwt.claim.sub',true);
 prior_claims text:=current_setting('request.jwt.claims',true);
begin
 select actor_id into actor from caie_private.store_access where singleton and enabled;
 if actor is null then
  raise exception 'El acceso público a la tienda está cerrado.' using errcode='42501';
 end if;
 if p_params is null or jsonb_typeof(p_params)<>'object' then
  raise exception 'Parámetros de operación inválidos.';
 end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 case p_operation
  when 'app_snapshot' then result:=public.app_snapshot();
  when 'export_snapshot' then result:=public.export_snapshot();
  when 'confirm_purchase' then
   result:=public.confirm_purchase((p_params->>'p_participant')::uuid,(p_params->>'p_event')::uuid,(p_params->>'p_key')::uuid,p_params->'p_items');
  when 'cancel_purchase' then
   perform public.cancel_purchase((p_params->>'p_purchase')::uuid,p_params->>'p_reason');
  when 'admin_participant' then
   perform public.admin_participant((p_params->>'p_id')::uuid,p_params->>'p_name',p_params->>'p_group',p_params->>'p_balance',p_params->>'p_reason',p_params->>'p_expected_balance');
  when 'admin_product' then
   result:=to_jsonb(public.admin_product((p_params->>'p_id')::uuid,p_params->>'p_name',p_params->>'p_category',p_params->>'p_price',(p_params->>'p_stock')::integer,(p_params->>'p_active')::boolean,p_params->>'p_reason',(p_params->>'p_expected_stock')::integer,p_params->>'p_expected_price'));
  when 'admin_event' then
   result:=to_jsonb(public.admin_event((p_params->>'p_id')::uuid,p_params->>'p_name',(p_params->>'p_date')::date,p_params->>'p_action'));
  when 'initial_import' then
   result:=public.initial_import(p_params->>'p_fingerprint',p_params->'p_participants',p_params->'p_products');
  else raise exception 'Operación pública no disponible.' using errcode='42501';
 end case;
 -- Do not let this identity leak into another operation in the transaction.
 perform set_config('request.jwt.claim.sub',coalesce(prior_sub,''),true);
 perform set_config('request.jwt.claims',coalesce(prior_claims,''),true);
 return result;
exception when others then
 perform set_config('request.jwt.claim.sub',coalesce(prior_sub,''),true);
 perform set_config('request.jwt.claims',coalesce(prior_claims,''),true);
 raise;
end $$;
revoke all on function public.open_store(text,jsonb) from public, anon, authenticated;
grant execute on function public.open_store(text,jsonb) to anon, authenticated;
