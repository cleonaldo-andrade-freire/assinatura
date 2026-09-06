-- Anamnese SaaS — Solicitação de exames no receituário
-- Rode uma vez no SQL Editor do Supabase, depois da 064.
--
-- Possibilidade não prevista no schema original: além dos medicamentos
-- (`items`), um receituário pode carregar uma lista de exames pedidos
-- (nome + observação/indicação clínica opcional) e pode até ser emitido
-- SÓ com exames, sem nenhum medicamento. Estrutura de cada item:
--   [{ "name": "Hemograma completo", "notes": "jejum de 8h" }, ...]
--
-- Aditiva: default '[]', receituários e modelos já existentes continuam
-- válidos sem exame nenhum.
alter table prescriptions add column exam_requests jsonb not null default '[]';
alter table prescription_templates add column exam_requests jsonb not null default '[]';
