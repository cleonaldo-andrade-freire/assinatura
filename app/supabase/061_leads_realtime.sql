-- Anamnese SaaS — Leads: tempo real no painel do mini-CRM
-- Rode uma vez no SQL Editor do Supabase.

-- Habilita o Realtime (postgres_changes) na tabela `leads` — mesmo padrão da
-- migration 023 pra `appointments`: o Kanban de Leads reflete um lead novo/
-- atualizado (ex.: virar "urgente") sem precisar recarregar a página. RLS
-- continua valendo nas mensagens do Realtime — cada clínica só recebe
-- eventos dos próprios leads.
alter publication supabase_realtime add table leads;
