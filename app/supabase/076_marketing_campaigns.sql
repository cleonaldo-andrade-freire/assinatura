-- Campanhas de promoção por WhatsApp (pacientes e leads que não viraram
-- paciente). Rode uma vez no SQL Editor do Supabase, depois da 075.
--
-- Fluxo: a campanha manda primeiro um CONVITE curto ("posso te mandar os
-- detalhes?"); só quem responde SIM recebe o conteúdo (texto + imagem/vídeo).
-- NÃO/SAIR grava um opt-out permanente por telefone (marketing_opt_outs) —
-- esse número nunca mais entra em campanha nenhuma da clínica.
--
-- Ritmo (proteção do número da clínica, que já foi bloqueado uma vez): o
-- envio sai por uma fila (marketing_campaign_recipients), um contato por vez,
-- intervalo aleatório de 4 a 7 min, só seg–sex 9h–18h (Brasília, sem
-- feriado nacional), no máximo 30 por dia por clínica. Quem decide tudo isso
-- é a rota /api/cron/campaign-sender — o pg_cron abaixo só a chama a cada
-- minuto (mesmo padrão da 045).
--
-- Módulo desligado por padrão. Depois de rodar, ligue só para a clínica que
-- usa:
--   update clinics set campaigns_enabled = true where id = '<clinic_id>';
--
-- ⚠️ Bucket de Storage novo, criado manualmente (Storage > New bucket, igual
-- "treatment-evolution-images"):
--   nome: campaign-media — privado (não marcar "Public bucket").
--   A Evolution baixa a mídia por URL assinada de curta duração.

alter table clinics
  add column campaigns_enabled boolean not null default false,
  -- Portão do ritmo, por clínica (não por campanha): duas campanhas ativas
  -- ao mesmo tempo continuam respeitando o intervalo entre mensagens.
  add column campaign_next_send_at timestamptz;

-- ---- Campanhas --------------------------------------------------------------
create table marketing_campaigns (
  id                   uuid primary key default gen_random_uuid(),
  clinic_id            uuid not null references clinics(id) on delete cascade,
  name                 text not null,
  -- 'pacientes' | 'leads' (leads cujo telefone não é de paciente) | 'todos'
  audience             text not null check (audience in ('pacientes', 'leads', 'todos')),
  -- Só pacientes com ao menos um agendamento "atendido" (leads não são afetados).
  only_attended        boolean not null default false,
  invite_text          text not null,
  content_text         text not null,
  media_key            text,
  media_type           text check (media_type in ('image', 'video')),
  media_mime           text,
  media_name           text,
  status               text not null default 'rascunho'
                         check (status in ('rascunho', 'enviando', 'pausada', 'concluida', 'cancelada')),
  pause_reason         text,
  consecutive_failures int not null default 0,
  started_at           timestamptz,
  finished_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index marketing_campaigns_clinic_idx on marketing_campaigns(clinic_id, created_at desc);
create index marketing_campaigns_sending_idx on marketing_campaigns(status) where status = 'enviando';

alter table marketing_campaigns enable row level security;
create policy "manage own marketing campaigns" on marketing_campaigns
  for all using (clinic_id in (select clinic_id from profiles where id = auth.uid()));

-- ---- Destinatários (a fila) ------------------------------------------------
create table marketing_campaign_recipients (
  id               uuid primary key default gen_random_uuid(),
  campaign_id      uuid not null references marketing_campaigns(id) on delete cascade,
  clinic_id        uuid not null references clinics(id) on delete cascade,
  phone            text not null,   -- só dígitos, com DDI 55
  name             text,
  patient_id       uuid references patients(id) on delete set null,
  lead_id          uuid references leads(id) on delete set null,
  -- pending → sending → sent (convite enviado, aguardando resposta)
  --   → interested (SIM, conteúdo enviado) | declined (NÃO/SAIR) | replied (outra resposta)
  -- failed (erro no envio) | skipped (opt-out, agendamento aguardando confirmação, etc.)
  status           text not null default 'pending'
                     check (status in ('pending', 'sending', 'sent', 'interested', 'declined', 'replied', 'failed', 'skipped')),
  skip_reason      text,
  sent_at          timestamptz,
  replied_at       timestamptz,
  reply_text       text,
  -- Última mensagem que o APP mandou pra esse contato — o webhook usa pra
  -- reconhecer o eco (fromMe) e não confundir com a dentista respondendo.
  last_outbound_at timestamptz,
  created_at       timestamptz not null default now(),
  unique (campaign_id, phone)
);

create index marketing_campaign_recipients_queue_idx on marketing_campaign_recipients(campaign_id, status, created_at);
create index marketing_campaign_recipients_phone_idx on marketing_campaign_recipients(clinic_id, phone, sent_at desc);
create index marketing_campaign_recipients_daily_idx on marketing_campaign_recipients(clinic_id, sent_at);

alter table marketing_campaign_recipients enable row level security;
create policy "manage own marketing campaign recipients" on marketing_campaign_recipients
  for all using (clinic_id in (select clinic_id from profiles where id = auth.uid()));

-- ---- Opt-out (LGPD) -------------------------------------------------------
create table marketing_opt_outs (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id) on delete cascade,
  phone      text not null,   -- só dígitos, com DDI 55
  source     text not null default 'whatsapp',  -- 'whatsapp' (respondeu NÃO/SAIR) | 'manual'
  reply_text text,
  created_at timestamptz not null default now(),
  unique (clinic_id, phone)
);

alter table marketing_opt_outs enable row level security;
create policy "manage own marketing opt outs" on marketing_opt_outs
  for all using (clinic_id in (select clinic_id from profiles where id = auth.uid()));

-- ---- Agendador ------------------------------------------------------------
-- Reaproveita o secret do Vault criado na 045 (mesmo CRON_SECRET da Vercel).
-- route.ts só implementa GET — por isso net.http_get.
select cron.schedule(
  'campaign-sender-tick',
  '* * * * *',
  $$
  select net.http_get(
    url := 'https://app.erodontologia.com.br/api/cron/campaign-sender',
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

-- Verificação: select * from cron.job where jobname = 'campaign-sender-tick';
-- Rollback: select cron.unschedule('campaign-sender-tick');
