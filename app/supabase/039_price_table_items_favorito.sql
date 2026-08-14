-- Anamnese SaaS — tratamento favorito (aparece primeiro/destacado no seletor)
-- Rode uma vez no SQL Editor do Supabase, depois da 038.

alter table price_table_items add column favorito boolean not null default false;
