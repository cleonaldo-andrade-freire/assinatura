-- Anamnese SaaS — CNPJ da clínica, pra aparecer no cabeçalho dos documentos
-- gerados (atestado, prescrição, orçamento, recibo, evolução, anamnese)
-- quando a clínica for pessoa jurídica. Opcional — null não aparece nos PDFs.
alter table clinics add column cnpj text;
