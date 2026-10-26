-- Declaração de comparecimento — segundo tipo de documento em `certificates`.
-- Rode uma vez no SQL Editor do Supabase, depois da 073.
--
-- kind = 'afastamento' é o atestado de sempre (dias de repouso). kind =
-- 'comparecimento' só registra a data (care_date) e o turno (shift) em que o
-- paciente esteve na clínica; rest_days fica 0 e starts_on = care_date.
-- Os registros antigos ficam todos como afastamento pelo default.

alter table certificates
  add column kind  text not null default 'afastamento'
    check (kind in ('afastamento', 'comparecimento')),
  add column shift text
    check (shift in ('manha', 'tarde', 'noite'));

alter table certificates
  add constraint certificates_shift_required
    check (kind <> 'comparecimento' or shift is not null);
