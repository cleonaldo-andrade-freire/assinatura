-- Reenviar o PDF assinado da anamnese por WhatsApp (ícone no grid do
-- dashboard, ver CertificateActions/PrescriptionActions para o mesmo
-- padrão) — precisa rastrear o último envio, igual certificates/prescriptions
-- já fazem. Aditiva: nullable, sem default que afete linha existente.
alter table anamneses add column sent_whatsapp_at timestamptz;
