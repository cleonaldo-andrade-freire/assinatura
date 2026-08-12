-- Anamnese SaaS — foto do paciente
-- Rode uma vez no SQL Editor do Supabase, depois da 014.
--
-- Guarda só a chave do objeto no bucket `patient-photos` (privado — foto de
-- paciente é dado sensível pela LGPD, não fica em bucket público como o logo
-- da clínica). O acesso passa sempre por uma rota autenticada do app, nunca
-- por URL direta do Storage — mesmo padrão de `certificate-pdfs`/`signed-pdfs`.

alter table patients add column photo_storage_key text;
