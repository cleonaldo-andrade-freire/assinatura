-- Assinatura digital (ICP-Brasil, via agente local — mesmo mecanismo já
-- usado em atestados/prescrições) da dentista sobre a evolução clínica,
-- separada da assinatura de ciência do paciente (migration 052). São dois
-- documentos distintos, amarrados pelo mesmo content_hash: este aqui prova
-- autoria; o outro prova que o paciente tomou ciência.
alter table treatment_evolutions add column dentist_signature_status text not null default 'nao_assinada';
  -- nao_assinada | assinada
alter table treatment_evolutions add column dentist_signed_at timestamptz;
alter table treatment_evolutions add column dentist_pdf_storage_key text;
alter table treatment_evolutions add column dentist_pdf_sha256 text;
