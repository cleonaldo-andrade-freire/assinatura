# Locação do consultório por turno

**Data:** 2026-10-12
**Status:** fase 1 implementada (migration 073) — falta rodar a migration e ligar a flag

---

## 1. Objetivo

A Dra. Ewerjane aluga a sala do consultório, por turno, para dentistas de fora. Hoje isso não existe no sistema: a ocupação fica na cabeça (ou num caderno), a cobrança depende de memória e a receita não aparece no Financeiro. Este documento descreve um módulo pequeno para registrar as locações, ver a semana num quadro, cobrar depois do uso e somar a receita ao Financeiro.

Parte de uma estratégia genérica de "locação de consultório por turno", recortada para o que este sistema já tem e para o caso real (ver seção 9 para o que ficou de fora e por quê).

## 2. Decisões tomadas

| Questão | Decisão |
|---|---|
| Direção | A clínica **aluga para terceiros** (é a locadora) |
| Salas | **Uma só** — não existe entidade "sala" |
| Quem usa | **Só a clínica da Dra. Ewerjane** — módulo ligado por flag na clínica, desligado para as demais |
| Cobrança | **Depois do uso**, por locação; dá pra baixar várias de uma vez (acerto mensal sem "fatura" própria) |
| Locatário | Cadastro próprio, **não** em `patients` |
| Receita | Tabela própria, somada à view `financial_monthly`; **não** passa por `treatment_debits` |
| Conflito | Garantido **no banco**, por intervalo de horário (mesmo padrão da agenda) |
| Agenda clínica | Bloqueio **cruzado** desde a fase 1 — sala alugada não recebe paciente, e vice-versa. Vale para a **agenda inteira**, sem olhar o local: a dentista não atende em outro endereço enquanto a sala está alugada |
| WhatsApp | **Nenhuma mensagem automática** ao locatário (regra da clínica: conta já foi bloqueada) |
| Acesso | Só papel `owner`, como o Financeiro |

### Por que não reaproveitar `patients` nem `treatment_debits`

`treatment_debits.patient_id` é obrigatório e o débito é a "produção clínica" no Financeiro. Pôr o locatário em `patients` faria ele aparecer na lista de pacientes, nos lembretes, na anamnese e no motor do WhatsApp — e misturaria dados de um profissional parceiro com dados de saúde (LGPD). Aluguel também não é produção clínica: no Financeiro ele precisa aparecer separado, para não inflar o número de atendimento.

## 3. Dados (migration `073`)

### 3.1 Flag na clínica

`clinics.room_rental_enabled boolean not null default false` — mesmo padrão de `lead_bot_enabled`. Ligada com um `update` só para a clínica da Dra. Ewerjane. Desligada, o item do menu e as rotas somem (as rotas respondem 404).

Não há coluna de local da sala: a sala fica no endereço padrão e a dentista não atende em outro lugar enquanto ela está alugada, então o bloqueio vale para a agenda toda (ver 3.5).

### 3.2 `room_rental_shifts` — turnos

`id, clinic_id, name, start_time time, end_time time, default_amount numeric(10,2), active, sort_order`.

- Configurável na aba "Turnos" da própria tela de locação. Primeira abertura semeia Manhã 07–12, Tarde 13–18, Noite 18–22, sem valor sugerido (a clínica preenche).
- `default_amount` é o valor sugerido no formulário. Não há tabela de preço com vigência: a locação grava o valor praticado, e isso já preserva o histórico.
- Turno usado não é apagado, é desativado (mesmo padrão de `clinic_locations`).
- `check (end_time > start_time)`.

### 3.3 `room_tenants` — locatários

`id, clinic_id, name, document (CPF ou CNPJ), cro, cro_uf, phone, email, notes, active, created_at, updated_at`.

Cadastro rápido direto do formulário da locação (só nome obrigatório).

### 3.4 `room_rentals` — locações

```sql
create table room_rentals (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinics(id) on delete cascade,
  tenant_id      uuid not null references room_tenants(id) on delete restrict,
  shift_id       uuid not null references room_rental_shifts(id) on delete restrict,
  rental_date    date not null,
  -- Snapshot do horário do turno no momento da criação: mudar o horário do
  -- turno depois não reescreve locações já feitas, e é por estes dois campos
  -- (não por shift_id) que o conflito é verificado.
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  amount         numeric(10,2) not null check (amount >= 0),
  notes          text,
  status         text not null default 'agendada' check (status in ('agendada', 'cancelada')),
  paid_at        timestamptz,
  payment_method text,
  cancelled_at   timestamptz,
  cancel_reason  text,
  series_id      uuid,          -- fase 2 (recorrência); nulo na fase 1
  created_by     uuid references profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table room_rentals add constraint room_rentals_no_overlap
  exclude using gist (clinic_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
  where (status <> 'cancelada');
```

- **Intervalo, não índice único por turno.** Com turnos configuráveis, alguém pode criar "Integral 07–18"; um índice único em `(data, turno)` não veria o choque com Manhã e Tarde. A exclusão por intervalo vê.
- `starts_at`/`ends_at` são calculados de `rental_date + start_time` **no fuso `America/Sao_Paulo`** — o mesmo cuidado de `lib/date.ts`.
- "Realizada" não é status: é `rental_date <= hoje` e `status = 'agendada'`. Status a mais é estado a mais para manter coerente.
- Pago = `paid_at` preenchido. Cancelar locação paga é bloqueado: primeiro desfaz o pagamento (decisão explícita, não acidente).
- Cancelamento em cima da hora com cobrança: **sem multa no sistema**. Se for cobrar, não cancela — edita o valor. Evita um conceito novo para um caso raro.

RLS: mesma policy "manage own …" das outras tabelas.

### 3.5 Bloqueio cruzado com a agenda

Duas tabelas, então a constraint de exclusão não basta. Um trigger `before insert or update` em cada lado:

- Em `room_rentals`: recusa se existir consulta não cancelada da clínica com horário sobreposto.
- Em `appointments` (só se a clínica tem a flag): recusa se existir locação `agendada` sobreposta.

O erro usa o código `23P01` (o mesmo da sobreposição de consultas), então todo código que já tratava conflito de agenda — inclusive o robô de leads — trata este sem mudança. O robô também passou a não oferecer horário dentro de turno alugado.

Os dois triggers pegam `pg_advisory_xact_lock(hashtext('room:' || clinic_id))` antes de checar — sem isso, uma consulta e uma locação gravadas no mesmo instante passariam as duas. O erro do trigger tem código próprio, que as rotas traduzem em mensagem amigável ("A sala está alugada para Dr. Fulano nesse horário").

O trigger em `appointments` é o ponto mais sensível da migration: ele roda para **todas** as clínicas do SaaS. Sai cedo (`return new`) quando a clínica não tem a flag, e o teste de aceitação inclui criar consulta numa clínica sem a flag.

### 3.6 Financeiro

A view `financial_monthly` ganha uma terceira fonte e uma coluna:

- `rental_revenue`: soma de `room_rentals.amount` com `status = 'agendada'`, agrupada pelo mês de **`rental_date`** (a data do uso — `date`, sem fuso para converter).
- `revenue_launched` continua sendo só `treatment_debits`. A tela soma as duas para "receita do mês" e mostra o aluguel separado no detalhe — produção clínica não pode ser inflada por aluguel.
- "A receber" passa a incluir locações já realizadas (`rental_date <= hoje`) e não pagas.

Competência, como o resto do Financeiro: locação de setembro paga em outubro conta em setembro.

## 4. Telas

Rota `dashboard/locacao`, só com a flag e para `owner`. Entrada pelo botão **"Locação da sala"** no topo do Financeiro — o menu lateral é estático e recebe só o papel (34 páginas o montam), então um item condicional exigiria passar a flag em todas elas. Abas: Quadro da semana, Locatários, Turnos.

**Quadro da semana (principal).** Linhas = turnos ativos, colunas = dias. Navegação de semana igual à da agenda. Cada célula:

- **Livre** — clicar abre o formulário com data e turno preenchidos e o valor sugerido.
- **Alugada** — nome do locatário, valor e selo "pago"/"a receber" (só depois da data). Clicar abre o detalhe: editar valor e observação, marcar como paga, cancelar.
- **Ocupada pela clínica** — há consulta no turno; cinza, sem ação. Dá a visão real da sala.

**A receber (abaixo do quadro).** Locações realizadas e não pagas, agrupadas por locatário, com total por locatário. Seleção múltipla + "Marcar como pagas" (data e forma de pagamento uma vez para todas) — é assim que o acerto mensal acontece sem uma entidade de fatura.

**Formulário.** Data, turno, locatário (busca + "novo locatário" inline), valor (pré-preenchido, editável), observação.

**Locatários.** Aba na mesma tela: lista, editar, desativar.

**Turnos.** Aba na mesma tela: nome, horário, valor sugerido, ativo.

## 5. Rotas

Todas em `/api/clinics/[clinicId]/room-rentals/...`, checando a flag:

- `GET ?from=&to=` — locações e consultas do período, já no formato do quadro (dia × turno × situação).
- `POST` — cria. `PATCH /[id]` — valor, observação. `POST /[id]/cancelar` — com motivo.
- `POST /pagar` — `{ ids[], paid_at, payment_method }`; `POST /[id]/desfazer-pagamento`.
- `room-tenants` e `room-rental-shifts` — CRUD simples.

## 6. Fases

**Fase 1 — o dia a dia.** Migration 073 completa (flag, turnos, locatários, locações, triggers, view), quadro semanal, formulário, detalhe, "a receber" com baixa em lote, locatários, turnos nas Configurações, receita no Financeiro.

**Fase 2 — conforto.** Recorrência ("toda quinta à tarde até dezembro": gera as locações de uma vez, com prévia das datas em conflito para pular), visão do mês com taxa de ocupação, recibo em PDF para o locatário (adaptando `receipts`), extrato do mês para enviar **manualmente** pelo WhatsApp.

## 7. Critérios de aceitação

- Duas locações sobrepostas gravadas ao mesmo tempo: só uma passa.
- Turno "Integral" criado depois de Manhã: locação Integral num dia com Manhã alugada é recusada.
- Consulta no horário de uma locação: recusada com a mensagem amigável, em qualquer local.
- Locação num turno com consulta parcial (ex.: 11h–11h30 dentro da Manhã): recusada.
- Clínica sem a flag: criar e editar consulta funciona exatamente como antes.
- Locação de setembro paga em outubro aparece no Financeiro em setembro.
- Cancelar locação paga é recusado.
- Autenticado como clínica A, nenhuma rota ou view devolve locação da clínica B.

## 8. Respostas (2026-10-12)

1. A sala fica no endereço padrão da clínica.
2. Turnos Manhã 07–12, Tarde 13–18, Noite 18–22; valores sugeridos a definir na aba Turnos.
3. A dentista não atende em outro endereço enquanto a sala está alugada — bloqueio na agenda inteira.

## 9. O que ficou de fora da estratégia original, e por quê

- **Entidade "sala" e tabela de preço com vigência** — uma sala só; o valor gravado na locação já preserva o histórico.
- **Cadastro genérico de pessoas** — não existe no sistema, e reaproveitar `patients` traria o locatário para fluxos clínicos (ver seção 2).
- **Fechamento mensal com título agrupado** — a baixa em lote cobre o acerto mensal sem uma entidade nova.
- **Evento de domínio / transação na aplicação** — o supabase-js não abre transação; o que precisa ser atômico (conflito, bloqueio cruzado) está no banco.
- **Arrastar para mover, FullCalendar** — o quadro reaproveita o visual da agenda; arrastar não se paga com ~3 locações por semana.
- **Notificações ao locatário** — proibidas por ora pela regra do WhatsApp da clínica.
