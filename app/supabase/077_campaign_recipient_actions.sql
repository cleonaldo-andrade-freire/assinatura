-- Campanhas: ações da clínica sobre cada contato (depois da 076).
-- Rode uma vez no SQL Editor do Supabase.
--
-- handled_at: a clínica marcou "Já respondi pelo WhatsApp" (ou resolveu o
-- contato por outra ação). O filtro "Precisa de atenção" esconde quem tem
-- handled_at preenchido.
--
-- marketing_opt_outs.source ganha um valor novo (a coluna não tem check):
--   'numero_errado' — a clínica marcou que o telefone não é da pessoa. O
--   número nunca mais entra em campanha e o cadastro do paciente mostra um
--   aviso pra atualizar o telefone.

alter table marketing_campaign_recipients
  add column handled_at timestamptz;
