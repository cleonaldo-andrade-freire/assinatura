-- Via não assinada digitalmente (shell mobile v2, prompt §8): a dentista
-- emite atestado/prescrição pelo celular sem passar pelo provedor de
-- assinatura ICP-Brasil, imprime, assina e carimba à mão. O mesmo registro
-- pode ser assinado digitalmente depois, no computador, sobre este mesmo
-- documento (não duplica).
--
-- `status` em certificates/prescriptions é uma coluna `text` livre, sem
-- enum/CHECK constraint no Postgres (a máquina de estados é só TypeScript,
-- ver lib/documentStatus.ts) — então o novo valor "pendente_assinatura" não
-- precisa de ALTER TYPE, só passa a ser usado pelo código a partir daqui.
-- Só a coluna abaixo é schema de verdade, e é puramente aditiva: nullable,
-- sem default que afete linha existente.
alter table certificates add column unsigned_pdf_at timestamptz;
alter table prescriptions add column unsigned_pdf_at timestamptz;
