-- Allow administrators to add participants without changing existing permissions.
create or replace function public.admin_participant(p_id uuid,p_name text,p_group text,p_balance text,p_reason text,p_expected_balance text) returns void language plpgsql security definer set search_path='' as $$
declare prior numeric;
begin
 perform public.require_role(true);
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Escribe el motivo del registro o ajuste.'; end if;
 perform set_config('caie.reason',trim(p_reason),true);
 if p_id is null then
  insert into public.participants(name,group_name,balance)
  values(trim(p_name),p_group,public.exact_hours(p_balance));
  return;
 end if;
 select balance into prior from public.participants where id=p_id for update;
 if not found then raise exception 'Participante no encontrado.'; end if;
 if prior is distinct from public.exact_hours(p_expected_balance) then raise exception 'El saldo cambió desde que abriste el formulario. Selecciona nuevamente al participante.'; end if;
 update public.participants set name=trim(p_name),group_name=p_group,balance=public.exact_hours(p_balance) where id=p_id;
end $$;
