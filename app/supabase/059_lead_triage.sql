-- Mini-CRM de triagem via WhatsApp — leads que caem no branch do webhook da
-- Evolution API que hoje só loga e ignora (nenhuma anamnese em andamento, nenhum
-- agendamento pendente pro telefone). Um agente de IA (Vercel AI SDK,
-- claude-haiku-4-5) passa a responder esse tráfego, decidindo entre agendar
-- direto (caso eletivo) ou marcar como urgente (dor aguda/inchaço/trauma) pra
-- a recepção assumir.
--
-- `status` é text + check (não um `create type ... enum`) — mesmo padrão já
-- usado em appointments.status: enum de verdade é doloroso de alterar depois
-- (ALTER TYPE ADD VALUE não é transacional em todas as versões), então o
-- projeto evita enum pra colunas de status desde as migrations mais recentes.
create table leads (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references clinics(id) on delete cascade,
  patient_phone     text not null,
  patient_name      text,
  status            text not null default 'bot_active'
                     check (status in ('bot_active', 'urgent', 'waiting_reply', 'scheduled')),
  clinical_summary  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index leads_clinic_id_idx on leads(clinic_id);

-- Evita lead duplicado pro mesmo telefone enquanto ainda está em triagem —
-- mesmo problema que conversations_active_phone_idx (migration 004) já resolve
-- pra anamnese: dois toques rápidos do paciente no meio da triagem não podem
-- criar dois registros. Uma vez agendado ('scheduled'), o telefone libera —
-- um novo contato depois disso é um novo atendimento, não retomada do mesmo.
create unique index leads_active_phone_idx on leads(clinic_id, patient_phone) where status <> 'scheduled';

alter table leads enable row level security;

-- Mesmo padrão de RLS usado no resto do schema (ver 034_treatments.sql etc.).
create policy "manage own leads" on leads
  for all using (clinic_id in (select clinic_id from profiles where id = auth.uid()));

-- DELETE restrito a owner — única tabela do domínio de leads em que isso é
-- pedido explicitamente (apagar um lead é uma decisão de dono da clínica, não
-- de atendente). A policy "manage own leads" acima já cobre insert/select/update
-- pra owner e staff; esta é adicional, só reforça a condição pra delete.
create policy "only owner deletes leads" on leads
  for delete using (
    clinic_id in (select clinic_id from profiles where id = auth.uid())
    and exists (select 1 from profiles where id = auth.uid() and role = 'owner')
  );

-- Histórico da conversa do lead (paciente/bot/atendente) — pro Kanban mostrar a
-- thread completa e pro agente de IA ter contexto multi-turn. Mesmo padrão de
-- appointment_events: clinic_id duplicado aqui (não só lead_id) pra a policy de
-- select não precisar de subquery em cima de leads a cada leitura.
create table lead_messages (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references leads(id) on delete cascade,
  clinic_id  uuid not null references clinics(id) on delete cascade,
  role       text not null check (role in ('patient', 'bot', 'staff')),
  content    text not null,
  created_at timestamptz not null default now()
);

create index lead_messages_lead_id_idx on lead_messages(lead_id, created_at);

alter table lead_messages enable row level security;

-- Só select pra quem está logado — igual appointment_events, os inserts vêm
-- sempre do backend (webhook com service role, ou rota autenticada quando a
-- recepção responde manualmente), nunca direto do client.
create policy "select own clinic lead messages" on lead_messages
  for select using (clinic_id in (select clinic_id from profiles where id = auth.uid()));

-- Interruptor pra clínica desligar o bot de triagem sem mexer em código —
-- aditivo, default true (comportamento novo só entra em vigor onde a clínica
-- não desligar explicitamente). Não existe um campo de "horário de
-- funcionamento" por clínica ainda (lib/appointments.ts já assume
-- AGENDA_START_HOUR/AGENDA_END_HOUR fixos pro app inteiro); o agente reaproveita
-- essas mesmas constantes em vez de inventar configuração nova por clínica.
alter table clinics add column lead_bot_enabled boolean not null default true;
