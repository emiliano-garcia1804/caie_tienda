-- All remote application of this migration requires explicit owner approval.
create table public.profiles (
 id uuid primary key references auth.users(id), display_name text not null check(length(trim(display_name)) between 1 and 160),
 role text not null check(role in ('operator','admin')), active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.participants (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 200),
 group_name text not null check(group_name in ('Pequeños','Medianos','Grandes','Mamás','Papás')),
 balance numeric(12,3) not null check(balance >= 0), original_status text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.products (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 200),
 category text not null check(category in ('Hogar','Higiene','Bebés','Útiles escolares','Juguetes','Comida')),
 price numeric(12,3) check(price >= 0), stock integer check(stock >= 0), active boolean not null default true,
 availability text generated always as (case when not active or price is null or stock is null then 'incomplete' when stock=0 then 'out' else 'available' end) stored,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.events (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 160),
 event_date date not null, state text not null default 'draft' check(state in ('draft','active','closed')),
 created_at timestamptz not null default now(), closed_at timestamptz,
 check ((state='closed') = (closed_at is not null))
);
create unique index one_active_event on public.events ((state)) where state='active';
create table public.purchases (
 id uuid primary key default gen_random_uuid(), participant_id uuid not null references public.participants,
 event_id uuid not null references public.events, operator_id uuid not null references public.profiles,
 created_at timestamptz not null default now(), total numeric(12,3) not null check(total>=0),
 balance_after numeric(12,3) not null check(balance_after>=0), state text not null default 'confirmed' check(state in ('confirmed','cancelled')),
 idempotency_key uuid not null unique, request jsonb not null,
 participant_name text not null, participant_group text not null,
 cancelled_at timestamptz, cancelled_by uuid references public.profiles, cancellation_reason text,
 check ((state='cancelled') = (cancelled_at is not null and cancelled_by is not null and length(trim(cancellation_reason))>0))
);
create table public.purchase_items (
 id uuid primary key default gen_random_uuid(), purchase_id uuid not null references public.purchases,
 product_id uuid not null references public.products, product_name text not null,
 quantity integer not null check(quantity>0), unit_price numeric(12,3) not null check(unit_price>=0),
 subtotal numeric(12,3) generated always as (quantity * unit_price) stored,
 unique(purchase_id,product_id)
);
create table public.audit_log (
 id bigint generated always as identity primary key, table_name text not null, record_id uuid not null,
 operation text not null, actor_id uuid references public.profiles, reason text not null,
 before_value jsonb, after_value jsonb, created_at timestamptz not null default now()
);
create table public.import_batches (
 id uuid primary key default gen_random_uuid(), fingerprint text not null unique check(fingerprint ~ '^[a-f0-9]{64}$'),
 participant_count integer not null, product_count integer not null, operator_id uuid not null references public.profiles,
 created_at timestamptz not null default now()
);
create index participants_group on public.participants(group_name);
create index purchases_status on public.purchases(event_id,participant_id) where state='confirmed';
create index purchases_date on public.purchases(created_at desc);
create index purchase_items_parent on public.purchase_items(purchase_id);
create index audit_record on public.audit_log(table_name,record_id,id);

create function public.is_operator() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and active)
$$;
create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and active and role='admin')
$$;
create function public.require_role(admin_only boolean default false) returns uuid language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_operator() or (admin_only and not public.is_admin()) then
  raise exception 'No tienes autorización para realizar esta operación.' using errcode='42501';
 end if;
 return auth.uid();
end $$;
create function public.exact_hours(v text) returns numeric language plpgsql immutable set search_path='' as $$
begin
 if v is null or v !~ '^[0-9]{1,9}(\.[0-9]{1,3})?$' then raise exception 'Las horas deben ser un decimal no negativo con hasta tres decimales.'; end if;
 return v::numeric;
end $$;
create function public.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_log(table_name,record_id,operation,actor_id,reason,before_value,after_value)
 values(tg_table_name,new.id,tg_op,auth.uid(),coalesce(nullif(current_setting('caie.reason',true),''),'Configuración inicial'),case when tg_op='UPDATE' then to_jsonb(old) end,to_jsonb(new));
 return new;
end $$;
create function public.touch_updated() returns trigger language plpgsql set search_path='' as $$begin new.updated_at=now(); return new; end $$;
do $$ declare t text; begin
 foreach t in array array['profiles','participants','products','events','purchases','purchase_items','import_batches'] loop
  execute format('create trigger audit_changes after insert or update on public.%I for each row execute function public.audit_change()',t);
 end loop;
 foreach t in array array['profiles','participants','products'] loop
  execute format('create trigger touch_updated before update on public.%I for each row execute function public.touch_updated()',t);
 end loop;
 foreach t in array array['profiles','participants','products','events','purchases','purchase_items','audit_log','import_batches'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy profile_read on public.profiles for select to authenticated using (public.is_operator());
create policy participant_read on public.participants for select to authenticated using(public.is_operator());
create policy product_read on public.products for select to authenticated using(public.is_operator());
create policy event_read on public.events for select to authenticated using(public.is_operator());
create policy purchase_read on public.purchases for select to authenticated using(public.is_operator());
create policy item_read on public.purchase_items for select to authenticated using(public.is_operator());
create policy audit_read on public.audit_log for select to authenticated using(public.is_admin());
create policy import_read on public.import_batches for select to authenticated using(public.is_admin());

-- A single SQL statement gives an MVCC-consistent snapshot for both UI and export.
create function public.app_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.require_role();
 select jsonb_build_object(
 'profile',(select to_jsonb(p) from public.profiles p where p.id=auth.uid()),
 'operators',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'display_name',p.display_name,'role',p.role,'active',p.active)) from public.profiles p),'[]'),
 'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.event_date desc,e.created_at desc) from public.events e),'[]'),
 'participants',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('balance',p.balance::text,'purchased',exists(select 1 from public.purchases c join public.events e on e.id=c.event_id where e.state='active' and c.participant_id=p.id and c.state='confirmed')) order by p.name) from public.participants p),'[]'),
 'products',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('price',p.price::text) order by p.name) from public.products p),'[]'),
 'purchases',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('total',c.total::text,'balance_after',c.balance_after::text,'items',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('unit_price',i.unit_price::text,'subtotal',i.subtotal::text) order by i.product_name) from public.purchase_items i where i.purchase_id=c.id),'[]')) order by c.created_at desc) from public.purchases c),'[]'),
 'audit',case when public.is_admin() then coalesce((select jsonb_agg(to_jsonb(a) order by a.id desc) from (select * from public.audit_log order by id desc limit 500) a),'[]') else '[]'::jsonb end,
 'captured_at',now()) into result;
 return result;
end $$;
create function public.export_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform public.require_role(true); return public.app_snapshot() - 'audit' - 'profile' ; end $$;

create function public.confirm_purchase(p_participant uuid,p_event uuid,p_key uuid,p_items jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; old_purchase public.purchases; person public.participants; prod public.products; item record;
 total_cost numeric:=0; purchase_id uuid; canonical jsonb; event_state text; receipt jsonb;
begin
 actor:=public.require_role();
 if p_key is null or p_participant is null or p_event is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Selecciona productos válidos.'; end if;
 if exists(select 1 from jsonb_array_elements(p_items) v where jsonb_typeof(v)<>'object' or (v->>'quantity') !~ '^[1-9][0-9]{0,5}$' or not (v ? 'quantity' and v ? 'product_id' and v ? 'expected_price')) then raise exception 'Las cantidades deben ser enteras positivas.'; end if;
 if (select count(*) from jsonb_array_elements(p_items))<>(select count(distinct v->>'product_id') from jsonb_array_elements(p_items) v) then raise exception 'Hay productos repetidos.'; end if;
 select jsonb_agg(jsonb_build_object('product_id',(v->>'product_id')::uuid,'quantity',(v->>'quantity')::integer,'expected_price',public.exact_hours(v->>'expected_price')::text) order by (v->>'product_id')::uuid) into canonical from jsonb_array_elements(p_items) v;
 canonical:=jsonb_build_object('participant',p_participant,'event',p_event,'items',canonical);
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 select * into old_purchase from public.purchases where idempotency_key=p_key;
 if found then
  if old_purchase.operator_id<>actor or old_purchase.request<>canonical then raise exception 'Este identificador ya pertenece a otra operación.'; end if;
  return jsonb_build_object('id',old_purchase.id,'total',old_purchase.total::text,'balance_after',old_purchase.balance_after::text,'state',old_purchase.state);
 end if;
 select state into event_state from public.events where id=p_event for share;
 if event_state is distinct from 'active' then raise exception 'El evento ya no está activo. Vuelve al inicio.'; end if;
 select * into person from public.participants where id=p_participant for update;
 if not found then raise exception 'Participante no encontrado.'; end if;
 -- Stable UUID order prevents opposing carts from deadlocking.
 for item in select (v->>'product_id')::uuid id,(v->>'quantity')::integer qty,public.exact_hours(v->>'expected_price') quoted from jsonb_array_elements(p_items) v order by (v->>'product_id')::uuid loop
  select * into prod from public.products where id=item.id for update;
  if not found or not prod.active or prod.price is null or prod.stock is null then raise exception 'Un producto tiene información pendiente o no está disponible.'; end if;
  if prod.price<>item.quoted then raise exception 'El precio de % cambió. Revisa el carrito.',prod.name; end if;
  if prod.stock<item.qty then raise exception 'Inventario insuficiente para %. Revisa el carrito.',prod.name; end if;
  total_cost:=total_cost+prod.price*item.qty;
 end loop;
 if total_cost>person.balance then raise exception 'Saldo insuficiente. Revisa las horas disponibles.'; end if;
 perform set_config('caie.reason','Compra confirmada',true);
 insert into public.purchases(participant_id,event_id,operator_id,total,balance_after,idempotency_key,request,participant_name,participant_group)
 values(p_participant,p_event,actor,total_cost,person.balance-total_cost,p_key,canonical,person.name,person.group_name) returning id into purchase_id;
 for item in select (v->>'product_id')::uuid id,(v->>'quantity')::integer qty from jsonb_array_elements(p_items) v order by (v->>'product_id')::uuid loop
  select * into prod from public.products where id=item.id;
  insert into public.purchase_items(purchase_id,product_id,product_name,quantity,unit_price) values(purchase_id,item.id,prod.name,item.qty,prod.price);
  update public.products set stock=stock-item.qty where id=item.id;
 end loop;
 update public.participants set balance=balance-total_cost where id=p_participant;
 receipt:=jsonb_build_object('id',purchase_id,'total',total_cost::text,'balance_after',(person.balance-total_cost)::text,'state','confirmed');
 return receipt;
end $$;

create function public.cancel_purchase(p_purchase uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid; c public.purchases; item record;
begin
 actor:=public.require_role(true);
 if p_reason is null or length(trim(p_reason))<3 then raise exception 'Escribe el motivo de anulación.'; end if;
 select * into c from public.purchases where id=p_purchase;
 if not found then raise exception 'Compra no encontrada.'; end if;
 perform 1 from public.events where id=c.event_id for share;
 perform 1 from public.participants where id=c.participant_id for update;
 select * into c from public.purchases where id=p_purchase for update;
 if c.state='cancelled' then raise exception 'Esta compra ya fue anulada.'; end if;
 for item in select * from public.purchase_items where purchase_id=c.id order by product_id loop
  perform 1 from public.products where id=item.product_id for update;
 end loop;
 perform set_config('caie.reason',trim(p_reason),true);
 update public.participants set balance=balance+c.total where id=c.participant_id;
 for item in select * from public.purchase_items where purchase_id=c.id order by product_id loop
  -- Purchased products always have known stock; never discard it through admin edits.
  update public.products set stock=stock+item.quantity where id=item.product_id;
 end loop;
 update public.purchases set state='cancelled',cancelled_at=now(),cancelled_by=actor,cancellation_reason=trim(p_reason) where id=c.id;
end $$;

create function public.admin_participant(p_id uuid,p_name text,p_group text,p_balance text,p_reason text,p_expected_balance text) returns void language plpgsql security definer set search_path='' as $$
declare prior numeric;
begin
 perform public.require_role(true);
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Escribe un motivo para el ajuste.'; end if;
 select balance into prior from public.participants where id=p_id for update;
 if not found then raise exception 'Participante no encontrado.'; end if;
 if prior is distinct from public.exact_hours(p_expected_balance) then raise exception 'El saldo cambió desde que abriste el formulario. Selecciona nuevamente al participante.'; end if;
 perform set_config('caie.reason',trim(p_reason),true);
 update public.participants set name=trim(p_name),group_name=p_group,balance=public.exact_hours(p_balance) where id=p_id;
end $$;
create function public.admin_product(p_id uuid,p_name text,p_category text,p_price text,p_stock integer,p_active boolean,p_reason text,p_expected_stock integer,p_expected_price text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; prior public.products;
begin
 perform public.require_role(true);
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Escribe un motivo para el ajuste.'; end if;
 if p_id is not null then
  select * into prior from public.products where id=p_id for update;
  if not found then raise exception 'Producto no encontrado.'; end if;
  if prior.stock is distinct from p_expected_stock or prior.price is distinct from (case when p_expected_price is null then null else public.exact_hours(p_expected_price) end) then raise exception 'El producto cambió desde que abriste el formulario. Selecciónalo nuevamente.'; end if;
  if prior.stock is not null and p_stock is null then raise exception 'No se puede borrar una existencia conocida; utiliza cero o desactiva el producto.'; end if;
 end if;
 perform set_config('caie.reason',trim(p_reason),true);
 if p_id is null then
  insert into public.products(name,category,price,stock,active) values(trim(p_name),p_category,case when p_price is null then null else public.exact_hours(p_price) end,p_stock,p_active) returning id into result;
 else
  update public.products set name=trim(p_name),category=p_category,price=case when p_price is null then null else public.exact_hours(p_price) end,stock=p_stock,active=p_active where id=p_id returning id into result;
 end if;
 return result;
end $$;
create function public.admin_event(p_id uuid,p_name text,p_date date,p_action text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; prior text;
begin
 perform public.require_role(true);
 perform pg_advisory_xact_lock(810241);
 perform set_config('caie.reason','Gestión de evento: '||p_action,true);
 if p_action='create' then
  insert into public.events(name,event_date) values(trim(p_name),p_date) returning id into result;
 elsif p_action in ('activate','close') then
  select state into prior from public.events where id=p_id for update;
  if not found then raise exception 'Evento no encontrado.'; end if;
  if p_action='activate' then
   if prior<>'draft' then raise exception 'Solo puedes activar un evento pendiente.'; end if;
   if exists(select 1 from public.events where state='active') then raise exception 'Cierra el evento activo antes de iniciar otro.'; end if;
   update public.events set state='active' where id=p_id;
  else
   if prior<>'active' then raise exception 'El evento no está activo.'; end if;
   update public.events set state='closed',closed_at=now() where id=p_id;
  end if;
  result:=p_id;
 else raise exception 'Acción de evento inválida.';
 end if;
 return result;
end $$;
create function public.admin_profile(p_id uuid,p_name text,p_role text,p_active boolean,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.require_role(true);
 perform pg_advisory_xact_lock(810242);
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Escribe un motivo.'; end if;
 if p_id=auth.uid() and (p_role<>'admin' or not p_active) then raise exception 'No puedes retirar tus propios permisos de administrador.'; end if;
 perform set_config('caie.reason',trim(p_reason),true);
 insert into public.profiles(id,display_name,role,active) values(p_id,trim(p_name),p_role,p_active)
 on conflict(id) do update set display_name=excluded.display_name,role=excluded.role,active=excluded.active;
end $$;

create function public.initial_import(p_fingerprint text,p_participants jsonb,p_products jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; batch public.import_batches; row jsonb; pc integer; ic integer;
begin
 actor:=public.require_role(true);
 perform pg_advisory_xact_lock(810243);
 select * into batch from public.import_batches where fingerprint=p_fingerprint;
 if found then return jsonb_build_object('participants_imported',0,'products_imported',0,'already_imported',true); end if;
 -- This importer can never replace operational balances or stock, even from another file.
 lock table public.participants, public.products in share row exclusive mode;
 if exists(select 1 from public.import_batches) or exists(select 1 from public.participants) or exists(select 1 from public.products) or exists(select 1 from public.purchases) then raise exception 'La importación inicial está cerrada. Usa ajustes auditados para conciliar datos.'; end if;
 if jsonb_typeof(p_participants)<>'array' or jsonb_typeof(p_products)<>'array' then raise exception 'Formato de importación inválido.'; end if;
 pc:=jsonb_array_length(p_participants); ic:=jsonb_array_length(p_products);
 if pc not between 1 and 2000 or ic not between 1 and 1000 then raise exception 'Número de registros inválido.'; end if;
 if exists(select 1 from jsonb_array_elements(p_participants) r group by r->>'group_name',lower(translate(regexp_replace(trim(r->>'name'),'\s+',' ','g'),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')) having count(*)>1) then raise exception 'Hay participantes ambiguos dentro del mismo grupo. Revisa el archivo.'; end if;
 perform set_config('caie.reason','Importación inicial validada',true);
 for row in select value from jsonb_array_elements(p_participants) loop
  insert into public.participants(name,group_name,balance,original_status) values(trim(row->>'name'),row->>'group_name',public.exact_hours(row->>'balance'),row->>'original_status');
 end loop;
 for row in select value from jsonb_array_elements(p_products) loop
  if row->>'stock' is not null and (row->>'stock') !~ '^[0-9]{1,9}$' then raise exception 'Las existencias deben ser enteros no negativos.'; end if;
  insert into public.products(name,category,price,stock) values(trim(row->>'name'),row->>'category',case when row->>'price' is null then null else public.exact_hours(row->>'price') end,(row->>'stock')::integer);
 end loop;
 insert into public.import_batches(fingerprint,participant_count,product_count,operator_id) values(p_fingerprint,pc,ic,actor);
 return jsonb_build_object('participants_imported',pc,'products_imported',ic,'already_imported',false);
end $$;

-- No default PUBLIC execution and no direct writes, including for admins.
do $$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname=any(array['is_operator','is_admin','require_role','exact_hours','audit_change','touch_updated','app_snapshot','export_snapshot','confirm_purchase','cancel_purchase','admin_participant','admin_product','admin_event','admin_profile','initial_import']) loop
  execute format('revoke all on function %s from public, anon, authenticated',f);
 end loop;
end $$;
grant execute on function public.is_operator(),public.is_admin() to authenticated;
grant execute on function public.app_snapshot(),public.export_snapshot(),public.confirm_purchase(uuid,uuid,uuid,jsonb),public.cancel_purchase(uuid,text),public.admin_participant(uuid,text,text,text,text,text),public.admin_product(uuid,text,text,text,integer,boolean,text,integer,text),public.admin_event(uuid,text,date,text),public.admin_profile(uuid,text,text,boolean,text),public.initial_import(text,jsonb,jsonb) to authenticated;
-- Preserve other applications' schema defaults: this migration does not alter default privileges globally.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.participants,public.products,public.purchases,public.events,public.profiles;
 end if;
end $$;
