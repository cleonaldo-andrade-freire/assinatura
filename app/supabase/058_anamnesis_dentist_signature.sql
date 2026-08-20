-- Contra-assinatura ICP-Brasil da dentista sobre a anamnese — hoje só o
-- paciente assina (no ato do preenchimento, via link do WhatsApp). Mesmo
-- espírito aditivo da 055 (equivalente pra evolução clínica): nenhuma coluna
-- existente muda, tudo nullable/com default, assinatura já feita antes desta
-- migration continua válida com dentist_signature_status = 'nao_assinada'.
--
-- Vai em `signatures` (não numa tabela nova) porque essa tabela já é 1:1 com
-- `anamneses` (anamnesis_id unique not null) — mesma ideia de colocar as
-- colunas da dentista direto em treatment_evolutions na 055, só que lá a
-- tabela já era a "linha da evolução" e aqui é a "linha da assinatura".
alter table signatures add column dentist_signature_status text not null default 'nao_assinada';
  -- nao_assinada | assinada
alter table signatures add column dentist_signed_at timestamptz;
alter table signatures add column dentist_pdf_storage_key text;
alter table signatures add column dentist_pdf_sha256 text;
-- Snapshot congelado do que a dentista efetivamente assinou (nome/CPF/telefone
-- do paciente + respostas, no momento da assinatura) — mesmo motivo de
-- content_snapshot/content_hash na 052: garante que o PDF assinado sempre
-- bate com o que foi lido, mesmo que o registro da anamnese mude depois.
alter table signatures add column dentist_content_snapshot jsonb;
alter table signatures add column dentist_content_hash text;
