-- Anamnese SaaS — troca de plano self-service, com efeito só na próxima cobrança
-- Rode uma vez no SQL Editor do Supabase.

alter table clinics add column pending_plan plan;
