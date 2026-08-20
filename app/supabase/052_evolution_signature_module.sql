-- Módulo de assinatura eletrônica da evolução clínica via WhatsApp.
-- Ver docs/mobile-audit.md não se aplica aqui — este é um módulo à parte,
-- mas segue o mesmo espírito aditivo: nenhuma tabela existente perde coluna,
-- nenhum valor é reordenado, nada é NOT NULL sem default sobre linha
-- existente.
--
-- Adaptado do prompt original (que assumia Postgres genérico com nomes em
-- português, n8n e S3) pra convenção já usada neste schema: tabelas em
-- inglês, sem n8n (a lógica roda direto nas rotas de API, como todo o
-- resto do sistema), sem trocar o Storage do Supabase por S3 — ver
-- docs/mobile-audit.md / análise publicada em 20/08/2026 pra detalhe de
-- cada adaptação e das lacunas que ficam de fora desta primeira fase
-- (Object Lock/WORM real, OTP + carimbo RFC 3161, verificação de bilateral
-- do dentista com ICP-Brasil — Níveis 2/3 do plano original).

-- ============================================================
-- 0. Texto do termo de adesão é CONFIGURÁVEL por clínica, não hardcoded no
--    código — cada clínica cola a versão revisada pelo próprio advogado em
--    Configurações. Nasce vazio de propósito: enquanto vazio, a Fase de
--    "solicitar assinatura" fica bloqueada (ver lib/electronicConsent.ts) —
--    não existe texto padrão pra alguém usar sem ter revisado antes.
-- ============================================================
alter table clinics add column consent_term_text text;
alter table clinics add column consent_term_version text;
alter table clinics add column consent_term_updated_at timestamptz;

-- ============================================================
-- 1. Termo de adesão ao meio eletrônico — uma vez por paciente.
--    Base legal do art. 10, §2º da MP 2.200-2/2001: o método só vale se
--    "admitido pelas partes". `term_version`/`term_text_hash` aqui são um
--    SNAPSHOT do que estava em clinics.consent_term_* no momento do aceite
--    — se a clínica editar o texto depois, o aceite antigo continua
--    referenciando exatamente o que a pessoa leu, não a versão nova.
-- ============================================================
create table electronic_consent_terms (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinics(id) on delete cascade,
  patient_id      uuid not null references patients(id) on delete cascade,
  term_version    text not null,
  term_text_hash  text not null,
  accepted_at     timestamptz not null default now(),
  accept_channel  text not null default 'whatsapp', -- 'whatsapp' | 'presencial_tablet'
  phone_e164      text not null,
  ip              text,
  user_agent      text,
  revoked_at      timestamptz,
  revoked_reason  text,
  created_at      timestamptz not null default now()
);
create index electronic_consent_terms_clinic_idx on electronic_consent_terms(clinic_id);
create index electronic_consent_terms_patient_idx on electronic_consent_terms(patient_id);
-- Só um termo ativo por paciente por vez — revogar cria espaço pra um novo.
create unique index electronic_consent_terms_active_idx on electronic_consent_terms(patient_id) where revoked_at is null;

-- ============================================================
-- 2. Assinatura da anamnese ganha o traçado vetorial (pontos + pressão +
--    tempo), que faltava — hoje só existe o PNG achatado embutido no PDF.
--    Aditiva: nullable, sem default que reprocesse linha existente. Uma
--    assinatura já feita antes desta migration simplesmente não tem
--    stroke_data — não é reprocessada, não é invalidada.
-- ============================================================
alter table signatures add column stroke_data jsonb;

-- ============================================================
-- 3. Evolução clínica ganha os campos de solicitação de assinatura —
--    todos nullable/com default, não afeta nenhuma evolução já registrada.
-- ============================================================
alter table treatment_evolutions add column signature_token uuid unique default gen_random_uuid();
alter table treatment_evolutions add column signature_status text not null default 'nao_solicitada';
  -- nao_solicitada | solicitada | assinada | recusada | expirada
alter table treatment_evolutions add column signature_requested_at timestamptz;
alter table treatment_evolutions add column signature_token_expires_at timestamptz;
alter table treatment_evolutions add column signature_verification_attempts smallint not null default 0;
alter table treatment_evolutions add column signature_blocked_until timestamptz;
alter table treatment_evolutions add column signature_refused_at timestamptz;
alter table treatment_evolutions add column signature_refused_reason text;
alter table treatment_evolutions add column content_snapshot jsonb;
alter table treatment_evolutions add column content_hash text;
alter table treatment_evolutions add column sent_whatsapp_at timestamptz;

-- ============================================================
-- 4. Assinatura da evolução — mesmo formato de `signatures`, tabela própria
--    (não reaproveita `signatures` porque essa já tem `anamnesis_id unique
--    not null`; forçar um FK opcional ali quebraria a garantia atual de
--    "toda linha de signatures pertence a uma anamnese"). `stroke_data`
--    nasce junto, sem precisar de migration futura pra isso.
-- ============================================================
create table treatment_evolution_signatures (
  id                      uuid primary key default gen_random_uuid(),
  treatment_evolution_id  uuid unique not null references treatment_evolutions(id) on delete cascade,
  clinic_id               uuid not null references clinics(id) on delete cascade,
  signer_name             text not null,
  signer_cpf              text,
  signed_at_client        timestamptz not null,
  signed_at_server        timestamptz not null default now(),
  ip                      text,
  user_agent              text,
  sha256                  text not null,
  pdf_storage_key         text not null,
  stroke_data             jsonb,
  verification_code       text unique not null,
  created_at              timestamptz not null default now()
);
create index treatment_evolution_signatures_clinic_idx on treatment_evolution_signatures(clinic_id);

-- ============================================================
-- 5. Cadeia de auditoria — append-only, encadeada por hash. Genérica por
--    (document_type, document_id) em vez de uma tabela por tipo de
--    documento, pra não precisar de migration nova quando um terceiro tipo
--    de documento assinável aparecer (orçamento, por exemplo).
-- ============================================================
create table document_signature_events (
  id             bigserial primary key,
  clinic_id      uuid not null references clinics(id) on delete cascade,
  document_type  text not null, -- 'anamnesis' | 'treatment_evolution'
  document_id    uuid not null, -- anamneses.id ou treatment_evolutions.id, conforme document_type
  sequence       int not null,
  event_type     text not null,
  occurred_at    timestamptz not null default now(),
  actor          text not null, -- 'system' | 'dentist' | 'patient'
  actor_id       uuid,
  payload        jsonb not null default '{}'::jsonb,
  ip             text,
  user_agent     text,
  previous_hash  text,
  event_hash     text not null,
  unique (document_type, document_id, sequence)
);
create index document_signature_events_doc_idx on document_signature_events(document_type, document_id);
create index document_signature_events_clinic_idx on document_signature_events(clinic_id);

-- Bloqueio de mutação no nível do banco, não só na aplicação — é o que dá
-- valor probatório à cadeia (ver prompt original §5, "assinatura_evento é
-- append-only, implemente no banco").
create or replace function block_document_signature_events_mutation() returns trigger as $$
begin
  raise exception 'document_signature_events é append-only: % bloqueado', TG_OP;
end;
$$ language plpgsql;

create trigger trg_document_signature_events_immutable
  before update or delete on document_signature_events
  for each row execute function block_document_signature_events_mutation();
