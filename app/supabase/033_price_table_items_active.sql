-- Anamnese SaaS — ativo/inativo por tratamento + suporte a duplicar tabela
-- Rode uma vez no SQL Editor do Supabase, depois da 032.

-- Tratamento inativo continua cadastrado (histórico/preço preservado), só
-- some do seletor de tratamento no orçamento — pensado pro "popular com
-- tratamentos comuns" trazer uma lista grande e a clínica desativar o que
-- não usa, em vez de ter que excluir linha por linha.
alter table price_table_items add column active boolean not null default true;

create index price_table_items_active_idx on price_table_items(price_table_id, active);
