-- Anamnese SaaS — portal de validação pública (código curto + QR code no PDF)
-- Rode uma vez no SQL Editor do Supabase, depois da 018.
--
-- `validation_code` fica nulo pra documentos já emitidos antes desta fatia —
-- `unique` permite múltiplos `null` no Postgres, sem problema. Só passa a ser
-- preenchido a partir daqui, quando `issueCertificate`/`issuePrescription`
-- gera um código na hora de assinar.

alter table certificates add column validation_code text unique;
alter table certificates add column revoked_at      timestamptz;
alter table certificates add column revoked_reason  text;
create index certificates_validation_code_idx on certificates(validation_code);

alter table prescriptions add column validation_code text unique;
alter table prescriptions add column revoked_at      timestamptz;
alter table prescriptions add column revoked_reason  text;
create index prescriptions_validation_code_idx on prescriptions(validation_code);
