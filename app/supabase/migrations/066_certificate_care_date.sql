-- 066_certificate_care_date.sql
-- Adiciona a coluna care_date na tabela certificates para armazenar a data em que o paciente efetivamente compareceu,
-- separando da data de início do afastamento (starts_on).

ALTER TABLE certificates
ADD COLUMN care_date DATE;

-- Para manter consistência nos registros antigos, define a data de atendimento como a data de início do afastamento já registrada
UPDATE certificates
SET care_date = starts_on;

-- Agora que não tem valores nulos, aplicamos a restrição NOT NULL com default para a data atual (para novos inserts que não passem o valor)
ALTER TABLE certificates
ALTER COLUMN care_date SET NOT NULL,
ALTER COLUMN care_date SET DEFAULT CURRENT_DATE;
