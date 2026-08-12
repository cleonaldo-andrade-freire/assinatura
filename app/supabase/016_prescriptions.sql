-- Anamnese SaaS — módulo de Prescrição Odontológica
-- Rode uma vez no SQL Editor do Supabase, depois da 015.
-- Mesma espinha dorsal de `010_dental_certificates.sql`, trocando o texto
-- único (reason) por uma lista de itens de medicamento.

create table prescriptions (
  id                          uuid primary key default gen_random_uuid(),
  clinic_id                   uuid not null references clinics(id) on delete cascade,
  token                       uuid unique not null default gen_random_uuid(),

  patient_name                text not null,
  patient_cpf                 text,
  patient_phone               text,
  patient_id                  uuid references patients(id) on delete set null,

  -- Snapshot do responsável técnico no momento da emissão.
  dentist_name                text not null,
  dentist_cro                 text not null,
  dentist_cro_uf              text not null,

  -- [{ "drug_name": "...", "dosage": "...", "instructions": "...", "generic_allowed": true }, ...]
  items                       jsonb not null default '[]',
  -- Orientações gerais opcionais, aceita os mesmos placeholders do atestado
  -- ({{paciente_nome}}, {{paciente_cpf}}, {{data_emissao}}).
  notes                       text,

  -- rascunho | aguardando_assinatura | assinado | falha
  status                      text not null default 'rascunho',
  signature_provider          text,
  signature_provider_doc_id   text,
  signature_requested_at      timestamptz,
  signed_at                   timestamptz,
  signature_error             text,

  pdf_storage_key             text,
  sha256                      text,
  sent_whatsapp_at            timestamptz,

  created_by                  uuid references profiles(id),
  created_at                  timestamptz not null default now()
);
create index prescriptions_clinic_id_idx on prescriptions(clinic_id);
create index prescriptions_patient_id_idx on prescriptions(patient_id);

alter table prescriptions enable row level security;

create policy "select own clinic prescriptions" on prescriptions
  for select using (clinic_id in (select clinic_id from profiles where id = auth.uid()));

-- Sem policy de insert/update/delete pra usuários autenticados de propósito —
-- criação e transição de status sempre passam pela chave de serviço no
-- servidor, mesmo padrão de `certificates`/`anamneses`/`signatures`.
