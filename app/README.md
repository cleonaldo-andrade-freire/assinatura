# Anamnese SaaS — app

Painel multi-clínica + API que substitui os webhooks do n8n para clínicas novas. Banco de dados, autenticação e armazenamento de PDF rodam no Supabase (via `supabase-js`, sem ORM). Veja `../guia-deploy-saas.md` na raiz do repositório para o passo a passo de deploy em produção (Vercel).

## Configurando o Supabase (uma vez)

1. Crie uma conta e um projeto grátis em [supabase.com](https://supabase.com).
2. Em **Project Settings → API**, copie a `URL`, a `anon public key` e a `service_role key`.
3. Em **SQL Editor → New query**, cole o conteúdo de `supabase/schema.sql` e clique em **Run** — isso cria as tabelas, os enums e as políticas de Row Level Security. Depois, rode também `supabase/002_add_clinic_logo.sql`, `supabase/003_add_whatsapp_number.sql`, `supabase/004_conversation_engine.sql`, `supabase/005_plan_tiers.sql` e `supabase/006_pending_plan.sql`, nessa ordem.
4. Em **Storage**, crie dois buckets:
   - `signed-pdfs` — **privado** (PDFs assinados)
   - `clinic-logos` — **público** (logo de cada clínica, usado na página de assinatura e no PDF)
5. Preencha essas informações no `.env` (veja `.env.example`).

Não precisa de Postgres/Docker local — dá pra desenvolver direto contra o projeto Supabase (inclusive o gratuito).

## Rodando localmente

```bash
npm install
cp .env.example .env      # preencha com os dados do seu projeto Supabase
npm run db:seed            # cria uma clínica de teste (login: demo@clinica.com / teste1234)
npm run dev                # http://localhost:3000
```

O seed imprime no terminal o `clinicId` e o `apiKey` da clínica de teste — é isso que você usaria no lugar de `X-Api-Key` para simular uma chamada do Typebot:

```bash
curl -X POST http://localhost:3000/api/clinics/<clinicId>/anamnesis \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: <apiKey>" \
  -d '{"patient_name":"Paciente Teste","patient_cpf":"000.000.000-00","answers":[{"question":"Fuma?","answer":"Não"}]}'
```

A resposta traz um `token` — abra `http://localhost:3000/assinatura?token=<token>` no navegador para testar o fluxo de assinatura de ponta a ponta.

## Como o acesso aos dados funciona

- **Rotas chamadas por Typebot/Asaas/paciente** (`/api/clinics/.../anamnesis`, `/api/anamnesis/...`, `/api/webhooks/asaas`) usam a `service_role key`, que ignora Row Level Security — porque quem chama essas rotas nunca tem uma sessão de usuário logado. A validação (API key da clínica, token da anamnese, token do webhook do Asaas) é feita no código de cada rota.
- **Painel** (`/dashboard`, `/billing`) usa o cliente com a sessão do usuário logado — as políticas de RLS em `supabase/schema.sql` garantem que cada clínica só enxerga os próprios dados, mesmo que uma rota esqueça de filtrar por `clinic_id`.

## Scripts

- `npm run dev` — servidor de desenvolvimento
- `npm run build` / `npm start` — build e start de produção
- `npm test` — testes unitários (Vitest)
- `npm run typecheck` — checagem de tipos
- `npm run db:seed` — cria a clínica de teste

## Duas formas de uma clínica funcionar

1. **Motor de conversa próprio (padrão, inclusive já em uso pela ER Odontologia)**: a clínica cadastra os modelos de anamnese em `/dashboard/templates` e conecta o próprio WhatsApp sozinha em `/dashboard/whatsapp` (QR Code, self-service — usa `EVOLUTION_ADMIN_BASE_URL`/`EVOLUTION_ADMIN_API_KEY`). Sem Typebot. Uma anamnese em andamento pode ser cancelada a qualquer momento na seção "Em andamento" do `/dashboard` (marca como `abandoned`, não apaga o histórico).
2. **Typebot (fluxo legado)**: uma instância do Typebot montada manualmente, com o bloco de Webhook final chamando `POST /api/clinics/{clinicId}/anamnesis` com o header `X-Api-Key`. Continua funcionando pra qualquer clínica que ainda esteja configurada assim, mas não é o caminho recomendado pra clínicas novas.

## Planos e cobrança de excedente

6 faixas de plano (`lib/asaas.ts`: `PLAN_MONTHLY_PRICE`, `PLAN_MONTHLY_LIMIT`, `PLAN_LABEL`), cada uma com um limite de anamneses por mês. O sistema **nunca bloqueia** a clínica por ter passado do limite — `lib/usage.ts` conta quantas anamneses (`anamneses`, não `conversations`) foram criadas desde o dia 1 do mês corrente, e se a unidade recém-criada ultrapassa o limite do plano, dispara uma cobrança avulsa de `OVERAGE_PRICE` (R$1,90, igual pra todos os planos) via Asaas (`createAsaasCharge`, `POST /payments` — diferente de `/subscriptions`), registrando em `usage_charges` pra aparecer no `/billing` da clínica. Chamado logo após cada `createAnamnesis` bem-sucedido, nos dois pontos de entrada (Typebot legado e motor de conversa novo).

Adicionar um plano novo: só mexer nos 3 `Record<Plan, ...>` em `lib/asaas.ts` — mas o valor do enum (`Plan` em `database.types.ts`) precisa existir primeiro no Postgres via uma migration com `alter type plan add value '...'` (cada uma como statement isolado, não pode estar na mesma transação que já usa o valor).

**Troca de plano self-service** (`/billing`, componente `PlanPicker`): a clínica escolhe um plano novo e o Asaas já passa a cobrar o valor dele na próxima fatura (`updateAsaasSubscription`), mas o `plan` da clínica no nosso banco **não muda na hora** — fica guardado em `pending_plan` até o webhook do Asaas (`/api/webhooks/asaas`) receber a confirmação desse próximo pagamento, que é quando `pending_plan` vira `plan` de fato. Isso evita qualquer descompasso entre "o que a clínica pode usar" e "o que ela está pagando".

## Componentes de UI compartilhados (`src/components/ui/`)

`ConfirmDialog` (modal de confirmação) e `ToastStack`/`useToasts` (mensagens de erro/sucesso) substituem os `confirm()`/`alert()` nativos do navegador em toda ação destrutiva do painel (cancelar assinatura, cancelar anamnese). Use esses componentes em vez de `confirm()`/`alert()` ao adicionar novas ações desse tipo.

## Integração com a Evolution API — pontos não óbvios

- `POST /webhook/set/{instance}` espera o payload **aninhado**: `{"webhook": {"enabled": true, "url": ..., "events": [...]}}`. Algumas versões da documentação mostram um formato achatado (`{"enabled": true, "url": ...}`) que retorna 400 nessa instância — ver `lib/evolutionAdmin.ts`.
- `setInstanceWebhook` (que registra essa URL) só é chamado no momento de **conectar/escanear o QR** (`/api/clinics/[clinicId]/whatsapp/connect`). Trocar `NEXT_PUBLIC_APP_URL` depois de uma clínica já estar conectada **não** atualiza o webhook sozinho — é preciso reconectar o WhatsApp ou chamar `setInstanceWebhook` manualmente com a URL nova.
- A rota `/api/webhooks/evolution/[instanceName]` loga (via `console.log`) cada caso em que ignora uma mensagem recebida (payload não reconhecido, clínica não encontrada, nenhuma conversa ativa pro telefone) — útil pra depurar pelos logs de produção quando uma resposta não avança a conversa.
