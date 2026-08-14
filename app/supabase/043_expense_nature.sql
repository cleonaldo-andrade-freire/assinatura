-- Anamnese SaaS — classifica despesa/recorrência como fixa ou variável
-- Rode uma vez no SQL Editor do Supabase, depois da 042.

alter table expenses add column nature text check (nature in ('fixa', 'variavel'));
alter table recurring_expenses add column nature text check (nature in ('fixa', 'variavel'));
