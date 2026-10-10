-- Read only. Run as admin from a protected DB connection. Empty result sets = no mismatches.
-- Balance audit trail: initial insert + exact deltas must reconcile with current balance.
with ledger as (
 select record_id, sum(coalesce((after_value->>'balance')::numeric,0)-coalesce((before_value->>'balance')::numeric,0)) expected
 from public.audit_log where table_name='participants' group by record_id
)
select p.id,p.balance,l.expected from public.participants p left join ledger l on l.record_id=p.id where p.balance is distinct from l.expected;
-- Inventory: unknown stock is deliberately excluded until first valid stock is recorded.
with ledger as (
 select record_id,sum(coalesce((after_value->>'stock')::integer,0)-coalesce((before_value->>'stock')::integer,0)) expected
 from public.audit_log where table_name='products' group by record_id
)
select p.id,p.stock,l.expected from public.products p left join ledger l on l.record_id=p.id where p.stock is not null and p.stock is distinct from l.expected;
select c.id,c.total,sum(i.subtotal) detail_total from public.purchases c left join public.purchase_items i on i.purchase_id=c.id group by c.id having c.total is distinct from sum(i.subtotal);
select id from public.participants where balance<0;
select id from public.products where stock<0 or price<0;
select count(*) active_events from public.events where state='active' having count(*)>1;
