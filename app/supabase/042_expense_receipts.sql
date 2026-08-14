-- Anamnese SaaS — comprovante de pagamento anexado à despesa
-- Rode uma vez no SQL Editor do Supabase, depois da 041.
-- Depois de rodar, crie manualmente um bucket privado "expense-receipts" no
-- Storage (mesmo processo já feito pra "receipt-pdfs"/"patient-images").

alter table expenses add column receipt_storage_key text;
alter table expenses add column receipt_file_name text;
alter table expenses add column receipt_content_type text;
