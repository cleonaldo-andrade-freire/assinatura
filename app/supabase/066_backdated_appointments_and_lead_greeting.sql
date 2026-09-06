-- Anamnese SaaS — Registro retroativo de agendamento + saudação automática de lead
-- Rode uma vez no SQL Editor do Supabase, depois da 065.
--
-- 1) `appointments.backdated`: marca um agendamento que é só REGISTRO de um
--    atendimento que já aconteceu (urgência atendida sem marcação prévia,
--    lançada no sistema depois). Nesse caso o app não notifica o paciente e
--    o agendamento entra direto como 'atendido'. Encaixe de urgência se
--    sobrepõe a outra consulta por natureza, então registros retroativos
--    ficam FORA da constraint de não-sobreposição — daí o drop/recreate do
--    `appointments_no_overlap` com o `and not backdated` no WHERE.
--
-- 2) `clinics.lead_bot_greeting`: resposta automática enviada uma única vez
--    quando um lead NOVO abre pelo WhatsApp (texto pré-preenchido do anúncio).
--    Null/vazio (padrão) = nenhuma resposta automática, comportamento atual.

alter table appointments add column backdated boolean not null default false;

alter table appointments drop constraint appointments_no_overlap;
alter table appointments add constraint appointments_no_overlap
  exclude using gist (
    clinic_id with =,
    professional_name with =,
    tstzrange(scheduled_at, ends_at, '[)') with &&
  )
  where (status not in ('cancelado_paciente', 'cancelado_dentista') and not backdated);

alter table clinics add column lead_bot_greeting text;
