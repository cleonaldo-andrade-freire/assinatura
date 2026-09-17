# Financeiro mensal — receita e despesa por mês, com gráficos

**Data:** 2026-09-16
**Status:** design em revisão — nada implementado

---

## 1. Objetivo

Hoje ninguém consegue responder "quanto a clínica produziu em agosto". As despesas já têm visão mensal ([dashboard/despesas](../../../src/app/dashboard/despesas/page.tsx)), mas a receita só existe espalhada por paciente, em `treatment_debits`. Este documento descreve uma tela única de dinheiro, com os últimos 12 meses em gráfico.

## 2. Decisões tomadas

| Questão | Decisão |
|---|---|
| Regime | **Competência** — conta no mês em que o débito foi lançado, pago ou não |
| Lugar | "Despesas" vira **"Financeiro"**; rota antiga redireciona |
| Gráficos | SVG próprio, sem biblioteca |
| Agregação | View no Postgres, não soma em JavaScript |

### Por que competência, e o que isso custa

Competência mede **produção da clínica**, não caixa. A consequência precisa estar escrita: **o gráfico não vai bater com o extrato bancário**, porque débito lançado e ainda não pago conta como receita do mês do lançamento.

Isso é correto para a pergunta que a tela responde, mas vira armadilha se os rótulos forem preguiçosos. Regras de escrita da tela:

- Nunca escrever "recebido" ou "entrou" para a série de receita. O rótulo é **"lançado no mês"**.
- Manter um número de **"a receber"** (débitos em aberto) visível, para que a diferença entre produção e caixa seja explícita em vez de virar suspeita de erro.
- O tile atual de "pago neste mês", que é caixa (`expenses.paid_at`), **continua como está** — com rótulo próprio, deixando claro que mede outra coisa.

### O lado da despesa precisa acompanhar

Hoje o total mensal de despesa usa `paid_at` (caixa). Para os dois lados do gráfico medirem a mesma coisa, a série de despesa passa a somar por **`due_date`**. Sem isso o saldo não significa nada: receita de competência menos despesa de caixa não é um número com sentido.

## 3. Dados

### 3.1 View `financial_monthly` (migration `069`)

A última migration é `068_lead_alert_toggle.sql`. (Existe também `supabase/migrations/066_certificate_care_date.sql`, numeração paralela de uma pasta antiga — não seguir por ali.)

Colunas: `clinic_id`, `month` (`date`, primeiro dia do mês), `revenue_launched`, `expense_due`.

- `revenue_launched`: soma de `treatment_debits.amount` agrupada pelo mês de `created_at`, **sem filtrar por status**.
- `expense_due`: soma de `expenses.amount` agrupada pelo mês de `due_date`.
- Meses sem movimento aparecem com zero — a série é preenchida na aplicação, não no SQL, para a view continuar simples.

**O mês é calculado no fuso do Brasil**, não em UTC: `date_trunc('month', created_at at time zone 'America/Sao_Paulo')`. Sem isso, um débito lançado às 21:30 do dia 31 cai no mês seguinte — a mesma classe de erro corrigida em `lib/date.ts` no commit `c512da9`.

### 3.2 RLS — ponto crítico

A view **tem que ser criada com `security_invoker = on`**. View comum no Postgres roda com as permissões de quem a criou, ignorando o RLS das tabelas de origem; num SaaS multi-inquilino isso faria uma clínica enxergar o faturamento de outra. O teste de aceitação desta migration é: autenticado como clínica A, consultar `financial_monthly` e não receber nenhuma linha da clínica B.

### 3.3 Consulta

Uma consulta só, filtrando `month >= (mês atual - 11 meses)`, devolve no máximo 12 linhas por clínica. É o que substitui trazer todos os lançamentos para somar no servidor.

## 4. Tela

Rota nova `dashboard/financeiro`; `dashboard/despesas` passa a redirecionar para ela, preservando os parâmetros de busca (paginação e mês já usados hoje). O item do menu em [ClinicShell.tsx:222](../../../src/components/clinic/ClinicShell.tsx#L222) muda de rótulo e destino. Segue restrita ao papel `owner`, como a tela de despesas é hoje.

Três camadas na vertical:

**Topo — os números do mês.** Receita lançada, despesa do mês, saldo, cada um com a variação contra o mês anterior. Sem gráfico: é o que responde a pergunta em dois segundos. Ao lado, "a receber" (débitos em aberto, acumulado).

**Meio — 12 meses.** Barras agrupadas de receita e despesa por mês, com a linha de saldo por cima. É onde aparecem sazonalidade e os meses no vermelho. Clicar num mês navega para o detalhe daquele mês (o parâmetro `month` que a tela já entende).

**Base — para onde foi.** As listas de despesas que já existem, mais as despesas do mês por categoria (`expenses.category`) em barras horizontais ordenadas por valor. Pizza não: com 8 categorias, comparar fatias é pior do que comparar comprimentos.

## 5. Gráficos

SVG escrito à mão, sem biblioteca. São dois tipos simples; Recharts custaria ~100 KB de bundle e traria um visual alheio ao resto do app, que é deliberadamente enxuto em dependências (ver `package.json`).

O guia de visualização de dados do projeto deve ser lido **antes** de escrever a primeira linha de gráfico — ele define paleta, forma e regras de interação, e é o que evita que estes dois gráficos pareçam de outro produto.

Piso de qualidade, não negociável:

- **Legível sem cor.** Receita e despesa se distinguem também por posição e rótulo, não só por matiz.
- **Alternativa textual.** Uma tabela com os mesmos números, disponível para leitor de tela — um `<svg>` sem isso é um buraco de acessibilidade.
- **Mobile.** Em tela estreita, 12 meses não cabem: o gráfico rola horizontalmente dentro do próprio contêiner, sem fazer a página rolar de lado.
- **Zero é zero.** Eixo de valor sempre começa em zero; barra truncada mente sobre proporção.

## 6. Testes

Funções puras, no padrão do projeto (`src/lib/*.test.ts`):

- preenchimento de meses vazios na série de 12 meses
- cálculo de variação contra o mês anterior, incluindo divisão por zero quando o mês anterior foi zero
- saldo negativo
- agrupamento por categoria, com despesa sem categoria caindo em "Sem categoria"
- escala do gráfico: valor máximo, todos os valores iguais, e série inteira zerada (não pode gerar barra de altura infinita nem `NaN`)

**Manual, antes de liberar:** conferir um mês fechado somando os lançamentos à mão e batendo com o topo da tela. E o teste de RLS da seção 3.2, que é o único cujo erro vaza dado entre clínicas.

## 7. Fora do escopo

Projeção de meses futuros; lucro por procedimento ou por dentista; exportação do gráfico; comparação ano contra ano; qualquer mudança no fluxo de lançar despesa ou receber pagamento.

## 8. Risco aberto

O volume atual é de uma clínica com poucos meses de histórico, então a view não tem como ser lenta agora. Se o produto crescer, o ponto de atenção é o índice em `treatment_debits(clinic_id, created_at)` e `expenses(clinic_id, due_date)` — vale conferir se já existem antes de assumir.
