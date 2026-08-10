-- Anamnese SaaS — preço da anamnese excedente vira campo por plano
-- Rode uma vez no SQL Editor do Supabase.

alter table plans add column overage_price numeric(10, 2);

update plans set overage_price = 2.29 where id = 'starter';
update plans set overage_price = 1.72 where id = 'basic';
update plans set overage_price = 1.53 where id = 'standard';
update plans set overage_price = 1.44 where id = 'plus';
update plans set overage_price = 1.24 where id = 'pro';
update plans set overage_price = 1.14 where id = 'enterprise';

alter table plans alter column overage_price set not null;
