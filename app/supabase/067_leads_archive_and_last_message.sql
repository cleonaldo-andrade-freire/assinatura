-- Anamnese SaaS — Kanban de leads mais enxuto
-- Rode uma vez no SQL Editor do Supabase, depois da 066.
--
-- 1) `leads.archived_at`: lead tirado do quadro (agendado antigo, ou
--    arquivado à mão pela equipe). Sai das colunas e da lista de agendados,
--    mantém o histórico, aparece só na lista "Arquivados". Substitui o
--    "Excluir" como saída padrão (excluir apaga a conversa toda).
--
-- 2) `leads.last_message_at`: timestamp da última mensagem da conversa
--    (qualquer papel), mantido por appendLeadMessage. Ordena a coluna
--    "Aguardando resposta" (quem espera há mais tempo primeiro) e alimenta o
--    filtro "sem resposta há +2 dias" sem precisar de um join em
--    lead_messages a cada render do quadro.

alter table leads add column archived_at timestamptz;
alter table leads add column last_message_at timestamptz;

-- Retro-preenche com a última mensagem de cada lead (ou o created_at, se a
-- conversa não tiver mensagem nenhuma).
update leads l
set last_message_at = coalesce(
  (select max(m.created_at) from lead_messages m where m.lead_id = l.id),
  l.created_at
);

create index leads_clinic_status_archived_idx on leads (clinic_id, status, archived_at);
