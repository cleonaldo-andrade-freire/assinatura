-- Anamnese SaaS — controle de prótese (Kanban): modelo de dados
-- Rode uma vez no SQL Editor do Supabase, depois da 025.

-- Estágios fixos (não configuráveis pela clínica, por decisão de escopo —
-- mesmo fluxo que qualquer clínica odontológica usa com laboratório de
-- prótese: pré-laboratório -> envio -> laboratório -> agenda -> realizado).
create table prosthesis_orders (
  id                      uuid primary key default gen_random_uuid(),
  clinic_id               uuid not null references clinics(id) on delete cascade,
  -- Mesmo padrão de appointments.patient_id/patient_name/patient_phone: o
  -- paciente pode não estar cadastrado ainda, então nome/telefone vêm sempre
  -- em texto (snapshot), e patient_id é um vínculo opcional.
  patient_id              uuid references patients(id) on delete set null,
  patient_name            text not null,
  patient_phone           text not null,
  description             text not null,
  expected_delivery_date  date,
  stage                   text not null default 'pre_laboratorio'
                           check (stage in ('pre_laboratorio', 'envio', 'laboratorio', 'agenda', 'realizado')),
  -- Quando entrou no estágio atual — junto com prosthesis_order_events dá
  -- pra mostrar "há quanto tempo está parado aqui" no card sem recalcular a
  -- partir do histórico toda hora.
  stage_since             timestamptz not null default now(),
  notes                   text,
  created_by              uuid references profiles(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index prosthesis_orders_clinic_id_idx on prosthesis_orders(clinic_id);
create index prosthesis_orders_clinic_stage_idx on prosthesis_orders(clinic_id, stage);

alter table prosthesis_orders enable row level security;

create policy "manage own prosthesis orders" on prosthesis_orders
  for all using (clinic_id in (select clinic_id from profiles where id = auth.uid()));

-- Histórico de mudança de estágio — mesmo padrão de appointment_events
-- (clinic_id duplicado pra RLS não precisar de subquery em cima da tabela
-- principal a cada leitura).
create table prosthesis_order_events (
  id                  uuid primary key default gen_random_uuid(),
  prosthesis_order_id uuid not null references prosthesis_orders(id) on delete cascade,
  clinic_id           uuid not null references clinics(id) on delete cascade,
  from_stage          text,
  to_stage            text not null,
  actor               text not null check (actor in ('recepcao', 'sistema')),
  created_at          timestamptz not null default now()
);

create index prosthesis_order_events_order_id_idx on prosthesis_order_events(prosthesis_order_id, created_at);

alter table prosthesis_order_events enable row level security;

create policy "select own clinic prosthesis order events" on prosthesis_order_events
  for select using (clinic_id in (select clinic_id from profiles where id = auth.uid()));

-- Sem policy de insert pra usuário autenticado de propósito, igual
-- appointment_events: os eventos são sempre gravados pelo backend.

-- Modelo de mensagem do WhatsApp por clínica e por estágio de destino —
-- opcional: se a clínica não personalizar, o código usa o texto padrão (ver
-- DEFAULT_STAGE_TEMPLATE_BODY em lib/prosthesisTemplates.ts).
create table prosthesis_stage_templates (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id) on delete cascade,
  stage      text not null check (stage in ('pre_laboratorio', 'envio', 'laboratorio', 'agenda', 'realizado')),
  body       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, stage)
);

alter table prosthesis_stage_templates enable row level security;

create policy "manage own prosthesis stage templates" on prosthesis_stage_templates
  for all using (clinic_id in (select clinic_id from profiles where id = auth.uid()));
