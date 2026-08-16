-- Anamnese SaaS — agenda: troca o agendador dos lembretes de Vercel Cron pro
-- pg_cron do Supabase. Rode no SQL Editor do Supabase, depois da 044.
--
-- Motivo: o plano Hobby da Vercel só permite cron 1x/dia (ver comentário no
-- topo de app/src/app/api/cron/appointment-reminders/route.ts e o commit
-- 28e41f1). O pg_cron não tem essa trava. A lógica de negócio (templates,
-- Evolution API, idempotência por reminder_24h_sent_at/reminder_final_sent_at
-- nulo) continua 100% no route.ts — este arquivo só troca QUEM dispara a
-- chamada HTTP, não o que ela faz.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ⚠️ PASSO MANUAL OBRIGATÓRIO ANTES DE RODAR O RESTO DESTE ARQUIVO:
-- rode, uma única vez, com o valor REAL do CRON_SECRET configurado em
-- produção na Vercel (Project Settings → Environment Variables). NÃO
-- commite o valor real em lugar nenhum do repositório.
--


--
-- Se esse secret já existir (rodando esta migration de novo), use
-- vault.update_secret no lugar de create_secret.

-- route.ts só implementa GET (igual o Vercel Cron, que chama crons com GET) —
-- por isso aqui é net.http_get, não net.http_post (POST dá 405).
select cron.schedule(
  'appointment-reminders-tick',
  '*/30 * * * *',
  $$
  select net.http_get(
    url := 'https://anamnese.erodontologia.com.br/api/cron/appointment-reminders',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'cron_secret_appointment_reminders'
      )
    )
  );
  $$
);

-- Verificação: select * from cron.job where jobname = 'appointment-reminders-tick';
-- Rollback: select cron.unschedule('appointment-reminders-tick');
