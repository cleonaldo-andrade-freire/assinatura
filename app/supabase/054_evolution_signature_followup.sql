-- Reenvio automático do link de assinatura de evolução quando expira sem o
-- paciente responder (cron 1x/dia — ver /api/cron/evolution-signature-followup
-- e o limite de frequência de cron da Vercel no plano Hobby, documentado no
-- comentário daquele arquivo). Contador zera toda vez que a solicitação é
-- disparada manualmente pela clínica — só conta lembretes automáticos desde
-- o último toque humano, evitando insistir pra sempre com um paciente que não
-- respondeu a nada.
alter table treatment_evolutions add column signature_followup_count smallint not null default 0;
