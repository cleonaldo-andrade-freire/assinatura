-- Vincula uma evolução clínica a MAIS DE UM tratamento (N:N) — antes só
-- existia N:1 via treatment_evolutions.treatment_id. Objetivo: quando vários
-- tratamentos são finalizados juntos no mesmo atendimento (ex: consulta +
-- limpeza + restauração), eles compartilham UMA evolução só, e portanto UMA
-- assinatura só (paciente e dentista), em vez de uma linha/assinatura
-- duplicada por tratamento. Rode uma vez no SQL Editor do Supabase, depois
-- da 056.
--
-- Aditiva: treatment_evolutions.treatment_id continua existindo e
-- obrigatória — vira uma "âncora legada" (aponta pra um dos tratamentos do
-- grupo), sem exigir reescrever todo lugar que já lê ev.treatment_id.
create table treatment_evolution_treatments (
  treatment_evolution_id uuid not null references treatment_evolutions(id) on delete cascade,
  treatment_id            uuid not null references treatments(id) on delete cascade,
  primary key (treatment_evolution_id, treatment_id)
);
create index treatment_evolution_treatments_treatment_idx on treatment_evolution_treatments(treatment_id);

alter table treatment_evolution_treatments enable row level security;

create policy "manage own evolution treatment links" on treatment_evolution_treatments
  for all using (
    treatment_evolution_id in (
      select id from treatment_evolutions
      where clinic_id in (select clinic_id from profiles where id = auth.uid())
    )
  );

-- Backfill: toda evolução já existente ganha seu link 1:1 na tabela nova,
-- assim o resto do código pode ler só pela junção, sem caso especial pra
-- dado antigo (uma evolução de tratamento único vira, na prática, um grupo
-- de tamanho 1).
insert into treatment_evolution_treatments (treatment_evolution_id, treatment_id)
select id, treatment_id from treatment_evolutions
on conflict do nothing;
