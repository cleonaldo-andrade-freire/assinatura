-- Anamnese SaaS — adiciona o número de WhatsApp conectado à instância Evolution
-- da clínica (o número que o paciente efetivamente conversa com o Typebot).
-- Rode uma vez no SQL Editor do Supabase.

alter table clinics add column whatsapp_number text;
