-- Migração para adicionar credenciais OAuth do PSC (Certisign / VaultID) na tabela clinics
-- Para rodar no Supabase, basta colar este script no SQL Editor.

alter table clinics add column psc_access_token text;
alter table clinics add column psc_refresh_token text;
alter table clinics add column psc_certificate_alias text;
alter table clinics add column psc_certificate_pem text;
