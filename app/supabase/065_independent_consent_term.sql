-- Fluxo independente para assinatura do Termo de Adesão com PDF e traçado
-- Cria uma tabela para gerenciar a solicitação (token) e o documento final

create table consent_term_signatures (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  
  -- Controle de acesso / status
  token text not null unique,
  status text not null default 'aguardando_assinatura', -- 'aguardando_assinatura', 'assinado', 'expirado', 'cancelado'
  expires_at timestamptz,
  
  -- Snapshot do termo no momento da solicitação (para o caso da clínica mudar depois)
  term_version text not null,
  term_text_hash text not null,
  
  -- Auditoria de envio
  sent_whatsapp_at timestamptz,
  phone_e164 text,
  
  -- Dados da Assinatura (preenchidos quando status = 'assinado')
  signer_name text,
  signer_cpf text,
  signed_at_client timestamptz,
  signed_at_server timestamptz,
  ip text,
  user_agent text,
  stroke_data jsonb,
  verification_code text,
  
  -- Arquivo final
  pdf_storage_key text,
  sha256 text,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index consent_term_signatures_clinic_idx on consent_term_signatures(clinic_id);
create index consent_term_signatures_patient_idx on consent_term_signatures(patient_id);
create index consent_term_signatures_token_idx on consent_term_signatures(token);

alter table consent_term_signatures enable row level security;

create policy "manage own clinic consent signatures" on consent_term_signatures
  for all using (clinic_id in (select clinic_id from profiles where id = auth.uid()));

