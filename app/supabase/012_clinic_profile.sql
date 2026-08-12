-- Anamnese SaaS — perfil da clínica (contato do responsável técnico + endereço de atendimento)
-- Rode uma vez no SQL Editor do Supabase, depois da 011.

alter table clinics add column dentist_phone  text;
alter table clinics add column dentist_email  text;
alter table clinics add column clinic_address text;
