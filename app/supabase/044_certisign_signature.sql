-- Anamnese SaaS — suporte ao provider real de assinatura (Certisign Portal de
-- Assinaturas). Rode uma vez no SQL Editor do Supabase, depois da 043.

-- CPF da dentista, exigido pela Certisign como individualIdentificationCode
-- do signatário digital (deve bater com o titular do certificado A3).
alter table clinics add column dentist_cpf text;

-- A assinatura Certisign é assíncrona: document/create devolve um link de
-- assinatura (signUrl) que a dentista precisa abrir pra confirmar no app
-- (PIN/biometria), e uma key usada depois em document/package pra baixar o
-- PDF já assinado. signature_provider_doc_id (já existente) guarda o `id`
-- retornado por document/create.
alter table certificates add column signature_sign_url text;
alter table certificates add column signature_document_key text;

alter table prescriptions add column signature_sign_url text;
alter table prescriptions add column signature_document_key text;
