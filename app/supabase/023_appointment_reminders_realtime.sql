-- Anamnese SaaS — agenda: lembretes escalonados + tempo real no painel (Etapas 4/6 do módulo)
-- Rode uma vez no SQL Editor do Supabase, depois da 022.

-- Timestamps de controle pra não mandar o mesmo lembrete duas vezes — o cron
-- roda periodicamente (ver vercel.json) e usa "coluna ainda nula" como a
-- condição de idempotência, não uma janela de tempo exata.
alter table appointments add column reminder_24h_sent_at timestamptz;
alter table appointments add column reminder_final_sent_at timestamptz;

-- Habilita o Realtime (postgres_changes) na tabela — é o que permite o
-- painel da clínica refletir confirmação/cancelamento vindo do paciente sem
-- precisar recarregar a página manualmente (pedido explícito do escopo).
-- RLS continua valendo nas mensagens do Realtime — cada clínica só recebe
-- eventos das próprias linhas.
alter publication supabase_realtime add table appointments;
