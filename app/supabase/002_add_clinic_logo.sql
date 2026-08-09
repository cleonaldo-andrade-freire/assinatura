-- Anamnese SaaS — adiciona suporte a logo da clínica
-- Rode uma vez no SQL Editor do Supabase (depois de já ter rodado schema.sql).

alter table clinics add column logo_url text;
