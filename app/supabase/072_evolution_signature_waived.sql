-- Dispensar a assinatura do paciente numa evolução.
-- Rode uma vez no SQL Editor do Supabase, depois da 071.
--
-- Nem toda evolução vai ser enviada ao paciente para assinar. Marcada como
-- dispensada, ela sai da tela "Evoluções pendentes de assinatura" (continua
-- acessível pelo filtro "Dispensadas", de onde dá pra reativar) e o lembrete
-- automático diário (cron evolution-signature-followup) deixa de reenviá-la.
-- Solicitar a assinatura de novo pelo WhatsApp limpa a marcação.
--
-- Timestamp em vez de boolean pra registrar quando foi dispensada.
alter table treatment_evolutions
  add column signature_waived_at timestamptz;
