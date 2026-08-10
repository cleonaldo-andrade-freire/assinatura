-- Anamnese SaaS — desconto/preço customizado por clínica
-- Rode uma vez no SQL Editor do Supabase.

alter table clinics add column custom_monthly_price numeric(10, 2);
