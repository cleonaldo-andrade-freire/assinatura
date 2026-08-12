-- Anamnese SaaS — módulo de baixa em farmácia (dispensação de prescrição)
-- Rode uma vez no SQL Editor do Supabase, depois da 020.
--
-- Não precisa de migration pra mudar o formato de `prescriptions.items`
-- (jsonb) — a partir de agora cada item passa a poder ter `dispensed_at`,
-- `dispensed_by_crf` e `dispensed_by_pharmacy_cnpj`, preenchidos pela função
-- abaixo. Itens antigos sem esses campos continuam válidos (tratados como
-- "não dispensado").

create table prescription_dispensations (
  id             uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references prescriptions(id) on delete cascade,
  clinic_id      uuid not null references clinics(id) on delete cascade,
  item_index     int not null,
  drug_name      text not null,
  pharmacist_crf text not null,
  pharmacy_cnpj  text not null,
  dispensed_at   timestamptz not null default now()
);
create index prescription_dispensations_prescription_id_idx on prescription_dispensations(prescription_id);

alter table prescription_dispensations enable row level security;

create policy "select own clinic dispensations" on prescription_dispensations
  for select using (clinic_id in (select clinic_id from profiles where id = auth.uid()));

-- Sem policy de insert pra usuário autenticado de propósito — só a função
-- abaixo escreve aqui, sempre chamada pela chave de serviço (farmácia não tem
-- sessão de usuário, o código da prescrição é o que autoriza o acesso).

-- `select ... for update` trava a linha da prescrição durante a função inteira
-- (executa como uma transação implícita), evitando que duas baixas
-- concorrentes no mesmo item se sobreponham — pedido explícito do escopo
-- original.
create or replace function dispense_prescription_item(
  p_prescription_id uuid,
  p_item_index      int,
  p_crf             text,
  p_cnpj            text
) returns jsonb
language plpgsql
as $$
declare
  v_clinic_id uuid;
  v_items     jsonb;
  v_item      jsonb;
begin
  select clinic_id, items into v_clinic_id, v_items
  from prescriptions
  where id = p_prescription_id
  for update;

  if v_clinic_id is null then
    raise exception 'prescription_not_found';
  end if;

  v_item := v_items -> p_item_index;
  if v_item is null then
    raise exception 'item_not_found';
  end if;

  if (v_item ->> 'dispensed_at') is not null then
    raise exception 'already_dispensed';
  end if;

  v_item := v_item || jsonb_build_object(
    'dispensed_at', now(),
    'dispensed_by_crf', p_crf,
    'dispensed_by_pharmacy_cnpj', p_cnpj
  );
  v_items := jsonb_set(v_items, array[p_item_index::text], v_item);

  update prescriptions set items = v_items where id = p_prescription_id;

  insert into prescription_dispensations
    (prescription_id, clinic_id, item_index, drug_name, pharmacist_crf, pharmacy_cnpj)
  values
    (p_prescription_id, v_clinic_id, p_item_index, v_item ->> 'drug_name', p_crf, p_cnpj);

  return v_items;
end;
$$;
