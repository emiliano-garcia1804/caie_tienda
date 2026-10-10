-- Authorized inventory policy: allow signed stock; hours and prices stay nonnegative.
-- Existing transactions, row locks, idempotency and audit triggers are preserved.
begin;
alter table public.products drop constraint products_stock_check;
alter table public.products drop column availability;
alter table public.products add column availability text generated always as (
 case when not active or price is null or stock is null then 'incomplete'
 when stock <= 0 then 'review' else 'available' end
) stored;

create or replace function public.confirm_purchase(p_participant uuid,p_event uuid,p_key uuid,p_items jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
  -- Negative stock records inventory discrepancies without blocking a purchase.
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
commit;
