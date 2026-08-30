-- Liga/desliga o espelho de alerta de mensagens de lead (ver migration 067 e
-- `maybeSendLeadAlert` no webhook da Evolution). Opt-in: por padrão desligado,
-- pra nenhuma clínica começar a mandar aviso pro `notify_phone` sem escolher.
-- A clínica ativa em Configurações → WhatsApp (ou o admin no painel).
alter table clinics add column lead_alert_enabled boolean not null default false;
