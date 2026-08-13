-- Anamnese SaaS — agenda inteligente (Etapa 1 do módulo: modelo de dados + CRUD manual, sem WhatsApp ainda)
-- Rode uma vez no SQL Editor do Supabase, depois da 021.

-- Necessária pro EXCLUDE USING gist abaixo (índice de exclusão com igualdade
-- de uuid/text + sobreposição de intervalo, no mesmo índice).
create extension if not exists btree_gist;

create table appointments (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references clinics(id) on delete cascade,
  scheduled_at      timestamptz not null,
  duration_minutes  int not null default 30 check (duration_minutes > 0),
  status            text not null default 'agendado'
                     check (status in ('agendado', 'confirmado', 'cancelado_paciente', 'cancelado_dentista', 'atendido')),
  -- Independente do status, de propósito (pedido do escopo original) — um
  -- agendamento pode estar 'agendado' e urgente ao mesmo tempo.
  urgent            boolean not null default false,
  -- Mesmo padrão já usado em certificates/prescriptions: paciente pode não
  -- estar cadastrado ainda, então nome/telefone vêm sempre em texto (snapshot),
  -- e patient_id é um vínculo opcional preenchido na hora ou depois.
  patient_id        uuid references patients(id) on delete set null,
  patient_name      text not null,
  patient_phone     text not null,
  -- Snapshot do profissional responsável — o schema atual não tem uma tabela
  -- de profissionais (a clínica hoje é 1 dentista, ver dentist_name em
  -- clinics), então seguimos o mesmo padrão de denormalização já usado em
  -- certificates.dentist_name/prescriptions.dentist_name em vez de inventar
  -- uma entidade nova. Isso já é suficiente pro requisito de "sem conflito de
  -- horário duplo pro mesmo dentista" (comparação por igualdade de texto) e
  -- não fecha a porta pra virar uma FK própria depois, se a clínica precisar
  -- de multi-profissional de verdade.
  professional_name text not null,
  notes             text,
  -- Token pro link de confirmação por WhatsApp (Etapa 4) — mesmo padrão de
  -- anamneses.token/certificates.token: uuid aleatório, não sequencial,
  -- validado por igualdade exata. Único pra poder ser buscado direto.
  confirm_token     uuid not null default gen_random_uuid(),
  created_by        uuid references profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index appointments_clinic_id_idx on appointments(clinic_id);
create index appointments_clinic_scheduled_idx on appointments(clinic_id, scheduled_at);
create unique index appointments_confirm_token_idx on appointments(confirm_token);

-- Impede dois agendamentos sobrepostos pro mesmo profissional na mesma
-- clínica — nível de banco, não só checagem na aplicação (a aplicação ainda
-- faz uma checagem prévia pra devolver um erro amigável, mas é este índice
-- que garante a regra mesmo sob concorrência). Agendamentos cancelados não
-- entram na exclusão: cancelar libera o horário de verdade pra realocação.
alter table appointments add constraint appointments_no_overlap
  exclude using gist (
    clinic_id with =,
    professional_name with =,
    tstzrange(scheduled_at, scheduled_at + (duration_minutes || ' minutes')::interval, '[)') with &&
  )
  where (status not in ('cancelado_paciente', 'cancelado_dentista'));

alter table appointments enable row level security;

create policy "manage own appointments" on appointments
  for all using (clinic_id in (select clinic_id from profiles where id = auth.uid()));

-- Histórico de mudança de status (e de remarcação) — quem mudou, quando, e se
-- foi manual ou automático. Guarda clinic_id duplicado (em vez de só
-- appointment_id) pra a policy de RLS não precisar de subquery em cima de
-- appointments a cada leitura.
create table appointment_events (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) on delete cascade,
  clinic_id      uuid not null references clinics(id) on delete cascade,
  event_type     text not null check (event_type in ('created', 'status_changed', 'rescheduled')),
  from_status    text,
  to_status      text,
  actor          text not null check (actor in ('recepcao', 'paciente', 'sistema')),
  meta           jsonb,
  created_at     timestamptz not null default now()
);

create index appointment_events_appointment_id_idx on appointment_events(appointment_id, created_at);

alter table appointment_events enable row level security;

create policy "select own clinic appointment events" on appointment_events
  for select using (clinic_id in (select clinic_id from profiles where id = auth.uid()));

-- Sem policy de insert pra usuário autenticado de propósito, igual
-- prescription_dispensations: os eventos são sempre gravados pelo backend
-- (rota autenticada ou service role no fluxo de WhatsApp), nunca direto pelo
-- cliente — garante que o `actor` registrado é confiável.
