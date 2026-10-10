-- Read-only aggregate verification. Does not expose participant names or records.
with balances as (
  select record_id, sum(coalesce((after_value->>'balance')::numeric,0)-coalesce((before_value->>'balance')::numeric,0)) expected
  from public.audit_log where table_name='participants' group by record_id
), stocks as (
  select record_id, sum(coalesce((after_value->>'stock')::integer,0)-coalesce((before_value->>'stock')::integer,0)) expected
  from public.audit_log where table_name='products' group by record_id
)
select jsonb_build_object(
  'balance_mismatches',(select count(*) from public.participants p left join balances b on b.record_id=p.id where p.balance is distinct from b.expected),
  'stock_mismatches',(select count(*) from public.products p left join stocks s on s.record_id=p.id where p.stock is not null and p.stock is distinct from s.expected),
  'purchase_total_mismatches',(select count(*) from (select c.id from public.purchases c left join public.purchase_items i on i.purchase_id=c.id group by c.id having c.total is distinct from sum(i.subtotal)) inconsistent),
  'negative_balances',(select count(*) from public.participants where balance<0),
  'negative_prices',(select count(*) from public.products where price<0),
  'negative_stock_to_reconcile',(select count(*) from public.products where stock<0),
  'active_events',(select count(*) from public.events where state='active'),
  'participants',(select count(*) from public.participants),
  'products',(select count(*) from public.products),
  'purchases',(select count(*) from public.purchases)
) result;
