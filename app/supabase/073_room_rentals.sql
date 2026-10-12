-- Locação da sala do consultório por turno, para dentistas de fora.
-- Rode uma vez no SQL Editor do Supabase, depois da 072.
-- Design: docs/superpowers/specs/2026-10-12-locacao-consultorio-design.md
--
-- Módulo desligado por padrão. Depois de rodar, ligue só para a clínica que
-- usa (hoje, a da Dra. Ewerjane):
--   update clinics set room_rental_enabled = true where id = '<clinic_id>';
-- Os turnos padrão (Manhã/Tarde/Noite) são criados pela aplicação na
-- primeira abertura da tela.
--
-- Uma sala só por clínica — não existe entidade "sala". E a dentista não
-- atende em outro endereço enquanto a sala está alugada, então o bloqueio
-- cruzado com a agenda vale para a agenda inteira, sem olhar o local.

alter table clinics
  add column room_rental_enabled boolean not null default false;

-- ---- Turnos ---------------------------------------------------------------
-- Configuráveis (horário e valor sugerido). Turno já usado não é apagado, é
-- desativado — mesmo padrão de clinic_locations.
create table room_rental_shifts (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinics(id) on delete cascade,
  name           text not null,
  start_time     time not null,
  end_time       time not null,
  -- Só sugestão pro formulário: a locação grava o valor praticado, então
  -- mudar isto não reescreve histórico (por isso não há tabela de preço com
  -- vigência).
  default_amount numeric(10,2) check (default_amount >= 0),
  active         boolean not null default true,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (end_time > start_time)
);

create index room_rental_shifts_clinic_idx on room_rental_shifts(clinic_id, sort_order);
-- Também impede a semeadura dos turnos padrão de rodar em dobro quando duas
-- abas abrem a tela ao mesmo tempo.
create unique index room_rental_shifts_clinic_name_idx on room_rental_shifts(clinic_id, lower(name));

alter table room_rental_shifts enable row level security;
create policy "manage own room rental shifts" on room_rental_shifts
  for all using (clinic_id in (select clinic_id from profiles where id = auth.uid()));

-- ---- Locatários -----------------------------------------------------------
-- Cadastro próprio, NÃO em patients: o locatário é um profissional parceiro,
-- não pode cair em lista de pacientes, lembretes, anamnese ou no motor do
-- WhatsApp (nem misturar dado de parceiro com dado de saúde).
create table room_tenants (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id) on delete cascade,
  name       text not null,
  document   text,   -- CPF ou CNPJ, só dígitos
  cro        text,
  cro_uf     text check (cro_uf is null or char_length(cro_uf) = 2),
  phone      text,
  email      text,
  notes      text,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index room_tenants_clinic_idx on room_tenants(clinic_id, active, name);

alter table room_tenants enable row level security;
create policy "manage own room tenants" on room_tenants
  for all using (clinic_id in (select clinic_id from profiles where id = auth.uid()));

-- ---- Locações -------------------------------------------------------------
create table room_rentals (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinics(id) on delete cascade,
  tenant_id      uuid not null references room_tenants(id) on delete restrict,
  shift_id       uuid not null references room_rental_shifts(id) on delete restrict,
  rental_date    date not null,
  -- Snapshot do horário do turno na criação: mudar o horário do turno depois
  -- não reescreve locações já feitas, e é por estes dois campos (não por
  -- shift_id) que os conflitos são verificados.
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  amount         numeric(10,2) not null check (amount >= 0),
  notes          text,
  -- "Realizada" não é status: é rental_date <= hoje com status 'agendada'.
  status         text not null default 'agendada' check (status in ('agendada', 'cancelada')),
  -- Pago = paid_at preenchido. Cobrança é depois do uso.
  paid_at        timestamptz,
  payment_method text,
  cancelled_at   timestamptz,
  cancel_reason  text,
  -- Fase 2 (recorrência). Nulo na fase 1.
  series_id      uuid,
  created_by     uuid references profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (ends_at > starts_at),
  -- Cancelar locação paga é recusado: desfazer o pagamento antes é uma
  -- decisão explícita, não um efeito colateral.
  check (status <> 'cancelada' or paid_at is null)
);

create index room_rentals_clinic_date_idx on room_rentals(clinic_id, rental_date);
create index room_rentals_tenant_idx on room_rentals(tenant_id);

-- Duas locações sobrepostas: por INTERVALO, não índice único em (data,
-- turno) — com turnos configuráveis, um "Integral 07–18" criado depois
-- cruzaria com Manhã e Tarde sem um índice único perceber. Mesmo padrão de
-- appointments_no_overlap (migration 022; btree_gist já habilitado lá).
alter table room_rentals add constraint room_rentals_no_overlap
  exclude using gist (
    clinic_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status <> 'cancelada');

alter table room_rentals enable row level security;
create policy "manage own room rentals" on room_rentals
  for all using (clinic_id in (select clinic_id from profiles where id = auth.uid()));

-- ---- Bloqueio cruzado com a agenda ---------------------------------------
-- São duas tabelas, então uma constraint de exclusão não alcança: um
-- trigger de cada lado. Os dois pegam o MESMO advisory lock por clínica
-- antes de checar — sem isso, uma consulta e uma locação gravadas no mesmo
-- instante passariam as duas.
--
-- O erro usa errcode exclusion_violation (23P01) de propósito: todo código
-- que já trata o conflito da agenda (rotas de agendamento, robô de leads)
-- passa a tratar este também, sem mudança. A mensagem ('room_rented' /
-- 'room_rental_appointment_conflict') permite às rotas dar um texto melhor.
--
-- security definer: a checagem precisa enxergar a outra tabela qualquer que
-- seja o cliente que gravou (sessão do usuário ou service role do robô).

create function room_rental_check_appointments() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelada' then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('room:' || new.clinic_id::text));
  if exists (
    select 1 from appointments a
    where a.clinic_id = new.clinic_id
      and a.status not in ('cancelado_paciente', 'cancelado_dentista')
      and tstzrange(a.scheduled_at, a.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
  ) then
    raise exception 'room_rental_appointment_conflict' using errcode = 'exclusion_violation';
  end if;
  return new;
end;
$$;

create trigger room_rentals_check_appointments
  before insert or update of starts_at, ends_at, status on room_rentals
  for each row execute function room_rental_check_appointments();

-- Roda para TODAS as clínicas do SaaS — sai cedo quando a clínica não tem o
-- módulo. O fim da consulta é calculado aqui mesmo, e não lido de
-- new.ends_at: triggers BEFORE disparam em ordem alfabética, e este
-- ("appointments_check_room_rental") dispara antes de
-- "appointments_set_ends_at" (migration 022), com ends_at ainda velho.
create function appointment_check_room_rental() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  appt_end timestamptz;
begin
  if new.status in ('cancelado_paciente', 'cancelado_dentista') then
    return new;
  end if;
  if not exists (select 1 from clinics c where c.id = new.clinic_id and c.room_rental_enabled) then
    return new;
  end if;
  appt_end := new.scheduled_at + (new.duration_minutes || ' minutes')::interval;
  perform pg_advisory_xact_lock(hashtext('room:' || new.clinic_id::text));
  if exists (
    select 1 from room_rentals r
    where r.clinic_id = new.clinic_id
      and r.status = 'agendada'
      and tstzrange(r.starts_at, r.ends_at, '[)') && tstzrange(new.scheduled_at, appt_end, '[)')
  ) then
    raise exception 'room_rented' using errcode = 'exclusion_violation';
  end if;
  return new;
end;
$$;

create trigger appointments_check_room_rental
  before insert or update of scheduled_at, duration_minutes, status on appointments
  for each row execute function appointment_check_room_rental();

-- ---- Financeiro -----------------------------------------------------------
-- Terceira fonte da view da 069. `revenue_launched` continua sendo só
-- produção clínica (treatment_debits); o aluguel vem em coluna própria pra
-- não inflar a produção. Competência pela DATA DO USO (`rental_date`, tipo
-- date — sem fuso pra converter), paga ou não. Coluna nova no fim: `create
-- or replace view` só aceita acrescentar colunas no final.
create or replace view financial_monthly
with (security_invoker = on)
as
with receita as (
  select
    clinic_id,
    date_trunc('month', (created_at at time zone 'America/Sao_Paulo'))::date as month,
    sum(amount) as revenue_launched
  from treatment_debits
  group by 1, 2
),
despesa as (
  select
    clinic_id,
    date_trunc('month', due_date)::date as month,
    sum(amount) as expense_due
  from expenses
  group by 1, 2
),
locacao as (
  select
    clinic_id,
    date_trunc('month', rental_date)::date as month,
    sum(amount) as rental_revenue
  from room_rentals
  where status = 'agendada'
  group by 1, 2
),
meses as (
  select clinic_id, month from receita
  union
  select clinic_id, month from despesa
  union
  select clinic_id, month from locacao
)
select
  m.clinic_id,
  m.month,
  coalesce(r.revenue_launched, 0)::numeric as revenue_launched,
  coalesce(d.expense_due, 0)::numeric      as expense_due,
  coalesce(l.rental_revenue, 0)::numeric   as rental_revenue
from meses m
left join receita r on r.clinic_id = m.clinic_id and r.month = m.month
left join despesa d on d.clinic_id = m.clinic_id and d.month = m.month
left join locacao l on l.clinic_id = m.clinic_id and l.month = m.month;
