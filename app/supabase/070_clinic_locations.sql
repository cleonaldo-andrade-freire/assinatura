-- Locais de atendimento — a mesma clínica/profissional atende em mais de um
-- endereço (ex.: consultório próprio + sala alugada em outra cidade).
-- Rode uma vez no SQL Editor do Supabase, depois da 069.
--
-- O local vai no AGENDAMENTO (appointments.location_id), não no paciente nem
-- na anamnese: é a consulta que acontece num lugar. As mensagens da agenda
-- (confirmação, lembretes, remarcação) leem o local da consulta; o envio da
-- anamnese só escolhe um local na hora pra citar na mensagem, sem gravar.
--
-- Endereço em campos separados (e não um texto livre como
-- clinics.clinic_address) pra dar pra montar o link do Google Maps e
-- preencher pelo CEP. `maps_url` é opcional: vazio, a aplicação gera o link
-- de busca a partir do endereço (ver src/lib/locations.ts).
create table clinic_locations (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references clinics(id) on delete cascade,
  name         text not null,
  cep          text,
  street       text not null,
  number       text,
  complement   text,
  neighborhood text,
  city         text not null,
  state        text not null check (char_length(state) = 2),
  maps_url     text,
  is_default   boolean not null default false,
  -- Local com consultas vinculadas não é apagado (perderia o histórico de
  -- onde cada consulta foi) — é desativado: some dos seletores, mas as
  -- consultas antigas continuam mostrando o endereço.
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index clinic_locations_clinic_id_idx on clinic_locations(clinic_id);
-- Só um local padrão por clínica — trocar o padrão desmarca o anterior na
-- aplicação, na mesma request (mesmo padrão de price_tables).
create unique index clinic_locations_one_default_per_clinic on clinic_locations(clinic_id) where is_default;

alter table clinic_locations enable row level security;

create policy "manage own clinic locations" on clinic_locations
  for all using (clinic_id in (select clinic_id from profiles where id = auth.uid()));

-- `on delete restrict`: a aplicação já desativa em vez de apagar quando há
-- consulta vinculada; a FK é a garantia de verdade se alguém tentar direto.
alter table appointments
  add column location_id uuid references clinic_locations(id) on delete restrict;

create index appointments_location_id_idx on appointments(location_id) where location_id is not null;
