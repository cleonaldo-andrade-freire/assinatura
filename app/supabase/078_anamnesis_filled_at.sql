-- Anamnese Web: rascunho salvo a cada etapa (depois da 077).
-- Rode uma vez no SQL Editor do Supabase ANTES de publicar o código.
--
-- filled_at: quando o paciente respondeu as perguntas (rascunho ou envio
-- final). Com filled_at preenchido e sem linha em `signatures`, o painel
-- mostra "Preenchida, sem assinatura" — os dados já servem pro atendimento,
-- mas o documento ainda não tem valor de assinado.
-- Aditiva: nullable, sem default — linhas antigas ficam null.

alter table anamneses add column filled_at timestamptz;

-- Anamneses antigas não assinadas que já têm alguma resposta preenchida
-- (ex.: as criadas pelo Typebot) passam a contar como preenchidas.
update anamneses a
   set filled_at = a.created_at
 where a.filled_at is null
   and not exists (select 1 from signatures s where s.anamnesis_id = a.id)
   and exists (select 1 from jsonb_array_elements(a.answers) x where coalesce(x->>'answer', '') <> '');
