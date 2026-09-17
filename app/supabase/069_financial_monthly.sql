-- Financeiro mensal — receita e despesa por mês, por clínica.
-- Rode uma vez no SQL Editor do Supabase, depois da 068.
--
-- Substitui trazer todos os lançamentos pro servidor só pra somar: a view
-- devolve uma linha por mês (12 linhas numa consulta de um ano), em vez de
-- centenas de débitos e despesas.
--
-- REGIME: competência. A receita conta no mês em que o débito foi LANÇADO,
-- pago ou não — mede produção da clínica, não caixa. Por isso a despesa entra
-- por `due_date`, e não por `paid_at`: se um lado fosse competência e o outro
-- caixa, o saldo não significaria nada. Ver docs/superpowers/specs/
-- 2026-09-16-financeiro-mensal-design.md.

-- A view agrupa por (clinic_id, created_at); sem este índice vira varredura da
-- tabela inteira. O lado da despesa já tem o seu (expenses_due_date_idx).
create index if not exists treatment_debits_clinic_created_idx
  on treatment_debits(clinic_id, created_at);

-- `security_invoker = on` é OBRIGATÓRIO aqui, não é detalhe de estilo: sem
-- isso a view roda com as permissões de quem a criou e IGNORA o RLS das
-- tabelas de origem — qualquer clínica autenticada leria o faturamento de
-- todas as outras. Com a flag ligada, as policies de treatment_debits e
-- expenses valem normalmente.
create or replace view financial_monthly
with (security_invoker = on)
as
with receita as (
  select
    clinic_id,
    -- Fuso do Brasil, não UTC: `created_at` é timestamptz e um débito lançado
    -- às 21:30 do dia 31 cairia no mês seguinte se truncado direto em UTC.
    date_trunc('month', (created_at at time zone 'America/Sao_Paulo'))::date as month,
    sum(amount) as revenue_launched
  from treatment_debits
  group by 1, 2
),
despesa as (
  select
    clinic_id,
    -- `due_date` é `date` (data de calendário, sem hora): não tem fuso pra
    -- converter, e converter introduziria o erro que a linha acima evita.
    date_trunc('month', due_date)::date as month,
    sum(amount) as expense_due
  from expenses
  group by 1, 2
)
-- full outer join: mês só com receita e mês só com despesa precisam aparecer.
-- Mês sem movimento nenhum não vira linha aqui — quem consome preenche a
-- lacuna com zero (ver buildMonthlySeries em src/lib/financial.ts), pra view
-- não precisar gerar calendário.
select
  coalesce(r.clinic_id, d.clinic_id)      as clinic_id,
  coalesce(r.month, d.month)              as month,
  coalesce(r.revenue_launched, 0)::numeric as revenue_launched,
  coalesce(d.expense_due, 0)::numeric      as expense_due
from receita r
full outer join despesa d
  on r.clinic_id = d.clinic_id
 and r.month = d.month;
