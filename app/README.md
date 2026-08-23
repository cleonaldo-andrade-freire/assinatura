# Consultório sem papel — app

Painel multi-clínica + API para consultório odontológico, tudo integrado pelo WhatsApp: anamnese com assinatura eletrônica, agenda com confirmação/lembrete automático (redução de falta), atestados e prescrições com assinatura digital (ICP-Brasil via Certisign/PSC/agente local), orçamentos, tratamentos e evoluções clínicas, débitos/recibos financeiros do paciente, despesas da clínica e pedidos de prótese — nasceu como "anamnese via WhatsApp" mas cresceu pra cobrir a rotina inteira de um consultório de dentista. Banco de dados, autenticação e armazenamento de PDF rodam no Supabase (via `supabase-js`, sem ORM). Veja `../guia-deploy-saas.md` na raiz do repositório para o passo a passo de deploy em produção (Vercel).

## Funcionalidades

| Área | O que faz | Rota | Quem acessa |
|---|---|---|---|
| Dashboard | Visão geral: KPIs do dia/mês, agenda de hoje, cancelamentos e retornos pendentes de contato, tratamentos/débitos em aberto | `/dashboard` | owner + staff (KPIs financeiros só pra owner) |
| Agenda | Semana/mês/dia, criação e detalhe de agendamento (modal), confirmação/lembrete automático por WhatsApp | `/dashboard/agenda` | owner + staff |
| Pacientes | Cadastro, busca, ficha com abas (agendamentos, orçamentos, tratamentos, débitos, imagens, anamneses, termos, atestados, prescrições — ver restrição por papel abaixo) | `/dashboard/pacientes` | owner + staff (abas restritas pra staff) |
| Anamneses | Modelos de perguntas, conversa conduzida pelo WhatsApp, assinatura eletrônica do paciente com trilha de auditoria | `/dashboard/anamneses`, `/dashboard/templates` | só owner |
| Atestados | Emissão com assinatura digital ICP-Brasil, modelos de texto reaproveitáveis, revogação | `/dashboard/atestados` | só owner |
| Prescrições | Emissão com assinatura digital ICP-Brasil, controle de medicamento controlado, modelos, revogação | `/dashboard/prescricoes` | só owner |
| Orçamentos/Tratamentos | Orçamento por paciente, tabelas de preço por convênio, acompanhamento de tratamento em aberto/finalizado, evoluções clínicas com fotos | dentro da ficha do paciente, `/dashboard/configuracoes/tabelas-tratamento` | só owner |
| Financeiro do paciente | Débitos (a receber/recebido), recibos em PDF | dentro da ficha do paciente (aba Débitos) | owner + staff |
| Despesas | Contas fixas/variáveis da clínica, recorrentes, categorias, exportação CSV | `/dashboard/despesas` | só owner |
| Próteses | Quadro kanban por estágio (pedido → instalação), notificação de mudança de estágio por WhatsApp | `/dashboard/proteses` | owner + staff |
| Leads | Mini-CRM de triagem por IA no WhatsApp — kanban por status, thread completa por lead | `/dashboard/leads` | owner + staff |
| Configurações | Perfil da clínica/dentista responsável, logo, WhatsApp, plano/assinatura, download do agente local de assinatura | `/dashboard/configuracoes` | só owner |
| Equipe | Convidar/remover membros da equipe, definir papel (owner/staff) | `/dashboard/configuracoes/equipe` | só owner |
| Meu perfil | Nome e foto de exibição do próprio usuário logado (mostrados na sidebar) | `/dashboard/perfil` | owner + staff, cada um só o próprio |

Excluir (`Excluir` nos atestados/prescrições/anamneses/agendamentos) é **destrutivo** — some da tela e do PDF do Storage, sem volta. É diferente de "Revogar" (mantém o registro e o PDF, só marca como inválido) ou "Cancelar" (agendamento muda de status, continua no histórico).

## Perfis de acesso (owner / staff)

Cada usuário da clínica tem um papel em `profiles.role`: **owner** (dentista/dona da clínica — acesso total) ou **staff** (atendente — acesso operacional, sem dados clínicos/financeiros sensíveis). `lib/auth.ts` → `getClinicAndRole()` é a fonte única de verdade, usada por toda página do dashboard.

- **Convite**: owner convida em `/dashboard/configuracoes/equipe` (e-mail + papel) → `POST /api/clinics/[clinicId]/staff/invite` chama `supabase.auth.admin.inviteUserByEmail`, guardando `clinic_id`/`role` em `raw_user_meta_data` do convite. O e-mail leva a `/aceitar-convite`, onde a pessoa define a própria senha. O registro em `profiles` **não** é criado pelo app — a trigger `handle_staff_invite_confirmed()` (`supabase/048_staff_invite_trigger.sql`) cria automaticamente assim que o convite é confirmado (`auth.users.confirmed_at` passa de null pra preenchido).
- **Remover acesso**: "Revogar" em `/dashboard/configuracoes/equipe` (`DELETE /api/clinics/[clinicId]/staff/[userId]`) apaga só o registro em `profiles` — a conta em `auth.users` continua existindo (órfã, sem clínica), não é possível remover a si mesmo.
- **O que staff vê**: menu lateral (`ClinicShell.tsx` → `STAFF_ALLOWED_HREFS`) só mostra Dashboard, Agenda, Pacientes, Próteses e Leads. Dentro da ficha do paciente (`lib/patientTabs.ts` → `STAFF_ALLOWED_TAB_KEYS`), só Agendamentos, Tratamentos e Débitos. Todo o resto (Anamneses, Atestados, Prescrições, Despesas, Configurações e suas subpáginas, Orçamentos, Imagens) é bloqueado **em duas camadas**: o link some do menu/aba **e** a página faz `redirect("/dashboard")` no servidor pra quem tentar acessar direto pela URL — só esconder o link não bastava, os dados dessas seções nem chegam a ser consultados no banco pra um staff (as queries ficam atrás de `if (role === "owner")`, não só o componente visual).
- **Meu perfil** (`/dashboard/perfil`) é a única página "estilo Configurações" liberada pra staff — cada usuário edita só o próprio nome/foto (`profiles.name`/`profiles.avatar_url`, migração `049_profile_name_avatar.sql`), mostrados na sidebar.

## Configurando o Supabase (uma vez)

1. Crie uma conta e um projeto grátis em [supabase.com](https://supabase.com).
2. Em **Project Settings → API**, copie a `URL`, a `anon public key` e a `service_role key`.
3. Em **SQL Editor → New query**, cole o conteúdo de `supabase/schema.sql` e clique em **Run** — isso cria as tabelas, os enums e as políticas de Row Level Security. Depois, rode os demais arquivos `supabase/NNN_*.sql` **em ordem numérica** (002, 003, 004...) até o último existente na pasta — a lista cresce a cada funcionalidade nova, então em vez de enumerar cada arquivo aqui (o que ficaria desatualizado rápido), confie na ordem numérica dos nomes.
4. Em **Storage**, crie os buckets:
   - `signed-pdfs` — **privado** (PDFs de anamnese assinada)
   - `clinic-logos` — **público** (logo de cada clínica, usado na página de assinatura e no PDF)
   - `profile-avatars` — **público** (foto de perfil de cada usuário — owner ou staff — mostrada na sidebar)
   - `certificate-pdfs` — **privado** (PDFs de atestado odontológico)
   - `prescription-pdfs` — **privado** (PDFs de prescrição odontológica)
   - `patient-photos` — **privado** (foto de cada paciente cadastrado)
   - `patient-images` — **privado** (radiografias e fotos clínicas do paciente)
   - `treatment-evolution-images` — **privado** (fotos anexadas à evolução clínica de um tratamento)
   - `budget-pdfs` — **privado** (PDFs de orçamento)
   - `receipt-pdfs` — **privado** (PDFs de recibo de pagamento)
   - `expense-receipts` — **privado** (comprovantes de despesa da clínica)
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

1. **Motor de conversa próprio (padrão, inclusive já em uso pela ER Odontologia)**: a clínica cadastra os modelos de anamnese em `/dashboard/templates` e conecta o próprio WhatsApp sozinha em `/dashboard/configuracoes` (seção WhatsApp, componente `ConnectWhatsApp` — QR Code, self-service, usa `EVOLUTION_ADMIN_BASE_URL`/`EVOLUTION_ADMIN_API_KEY`). Sem Typebot. Uma anamnese em andamento pode ser cancelada a qualquer momento na seção "Em andamento" do `/dashboard` (marca como `abandoned`, não apaga o histórico).
2. **Typebot (fluxo legado)**: uma instância do Typebot montada manualmente, com o bloco de Webhook final chamando `POST /api/clinics/{clinicId}/anamnesis` com o header `X-Api-Key`. Continua funcionando pra qualquer clínica que ainda esteja configurada assim, mas não é o caminho recomendado pra clínicas novas.

## Mini-CRM de leads (triagem por IA no WhatsApp)

Quando uma mensagem chega no webhook da Evolution API (`/api/webhooks/evolution/[instanceName]`) e não corresponde a nenhuma anamnese em andamento nem a um agendamento pendente — hoje só ignorada e logada — um agente de IA (Vercel AI SDK + `@ai-sdk/anthropic`, modelo `claude-haiku-4-5`, `lib/leadAgent.ts`) assume a conversa, a menos que a clínica tenha desligado o recurso (`clinics.lead_bot_enabled`, default `true`, sem UI própria hoje — só via banco/admin).

- **Tools do agente**, todas operando sobre as tabelas reais da clínica (não dados fictícios): `consultarDisponibilidade` (consulta horários livres em `appointments` pro dentista responsável, reaproveitando `buildDaySlotTimes`/`buildContinuationMap` de `lib/appointments.ts`), `agendarPaciente` (cria o agendamento de verdade, com a mesma checagem de conflito de horário que a agenda manual usa) e `alertarUrgencia` (marca o lead como urgente e avisa `clinics.notify_phone`, pra recepção assumir na hora).
- **Modelo de dados** (`leads`/`lead_messages`, migration `059_lead_triage.sql`): um lead por telefone em triagem aberta (`status != 'scheduled'`); todo o histórico da conversa (paciente/bot/recepção) fica em `lead_messages`, usado tanto pro Kanban mostrar a thread completa quanto pra dar contexto multi-turn ao agente a cada nova mensagem.
- Exige `ANTHROPIC_API_KEY` configurada (ver `.env.example`) — sem ela, a chamada ao agente falha (best-effort: loga o erro, não derruba o webhook, mas o paciente não recebe resposta do bot).

## Planos, trial e cobrança de excedente

Os planos são **dado editável**, não constante no código: tabela `plans` (nome, preço, limite de anamneses, diferenciais, ordem de exibição, destaque "mais popular", ativo/inativo, preço de excedente — ver migrations `008_plans_table.sql` e `009_plan_overage_price.sql`). `clinics.plan`/`clinics.pending_plan` são `text` com foreign key pra `plans(id)` (antes era enum fechado do Postgres — trocado porque enum não dá pra editar/remover valor livremente). `lib/plans.ts` centraliza o acesso: `getActivePlans` (landing, seletores — só `active=true`), `getAllPlans` (CRUD do admin, inclui inativos), `getPlanById`, `planValueFor`/`effectiveMonthlyPrice` (cálculo de preço, considerando desconto customizado). CRUD completo em `/admin/plans` (`components/admin/PlanForm.tsx`, `api/admin/plans/`). Excluir um plano só funciona se nenhuma clínica o usa (a FK barra fisicamente) — a alternativa é desativar.

Cada plano tem um limite de anamneses por mês e seu próprio preço de excedente (`plans.overage_price`, editável no CRUD — sugestão padrão: preço mensal ÷ limite × 1,15, mas o admin pode ajustar manualmente por plano). Fora do trial, o sistema **nunca bloqueia** a clínica por ter passado do limite — `lib/usage.ts` conta quantas anamneses (`anamneses`, não `conversations`) foram criadas desde o dia 1 do mês corrente, e se a unidade recém-criada ultrapassa o limite do plano, soma o excedente (`unidades × plan.overage_price`) direto na **fatura pendente da própria assinatura** no Asaas (`getPendingInvoice` + `updateAsaasPaymentValue`, `PUT /payments/{id}` — recalcula plano + excedente do zero a cada chamada, nunca incrementa) — uma fatura só, descrição já mostra a composição do valor. Se por algum motivo não houver fatura pendente pra atualizar (raro), cai pra uma cobrança avulsa isolada como plano B (`createAsaasCharge`). Registra em `usage_charges` pra aparecer no `/billing` da clínica e no `/admin` da clínica (histórico de cobranças aparece nos dois lugares, mesma função `listPayments`). Chamado logo após cada `createAnamnesis` bem-sucedido, nos dois pontos de entrada (Typebot legado e motor de conversa novo).

**Trial é diferente: bloqueia de verdade.** `TRIAL_ANAMNESIS_LIMIT` (`lib/billing.ts`) = 3 anamneses, vitalício (não mensal) — `canAcceptAnamnesis(clinic, trialAnamnesesUsed)` recebe a contagem total (`countTotalAnamneses`) só quando `subscription_status === "trialing"` e bloqueia a 4ª tentativa com `402 trial_limit_reached`, sem gerar cobrança nenhuma (sem overage no trial). O painel mostra a mensagem com link direto pra `/billing`.

Adicionar um plano novo: direto em `/admin/plans/new`, sem precisar mexer em código nem rodar migration.

**Troca de plano self-service** (`/billing`, componente `PlanPicker`): a clínica escolhe um plano novo e o Asaas já passa a cobrar o valor dele na próxima fatura (`updateAsaasSubscription`), mas o `plan` da clínica no nosso banco **não muda na hora** — fica guardado em `pending_plan` até o webhook do Asaas (`/api/webhooks/asaas`) receber a confirmação desse próximo pagamento, que é quando `pending_plan` vira `plan` de fato. Isso evita qualquer descompasso entre "o que a clínica pode usar" e "o que ela está pagando". O admin vê essa troca pendente na lista e no detalhe da clínica.

**Ajustes manuais do admin** (`/admin/clinics/[id]`, componente `ClinicBillingAdjustments`, rota `PATCH /api/admin/clinics/[clinicId]/billing`): diferente da troca self-service, esses valem **na hora**.
- *Estender trial*: atualiza `trial_ends_at` **e** o `nextDueDate` da assinatura no Asaas juntos (`updateAsaasSubscriptionFields`) — só um dos dois deixaria a cobrança real dessincronizada da data mostrada pra clínica. Só permitido enquanto `subscription_status === "trialing"`.
- *Preço customizado/desconto*: campo `clinics.custom_monthly_price` — quando preenchido, substitui `plan.monthly_price` tanto na exibição (`effectiveMonthlyPrice`/`effectivePlanValue` em `lib/plans.ts`) quanto no valor real cobrado no Asaas (empurrado na hora, não espera a próxima fatura). Deixar em branco volta pro preço padrão do plano.
- Não existe um mecanismo separado de "isenção" — pra dar acesso gratuito por um período, é só estender o trial pra uma data bem no futuro.

## Trilha de auditoria da assinatura

`signatures` já guardava `sha256`, `ip`, `user_agent`, `signed_at_client`/`signed_at_server` desde o início, mas nada na interface mostrava isso. `/dashboard/anamneses/[id]` exibe as respostas da anamnese + toda essa trilha (link "Ver detalhes" na lista do dashboard) — é a evidência que sustenta a validade jurídica (MP 2.200-2/2001, Lei 14.063/2020) em caso de contestação.

## Termo de Adesão (Assinatura Eletrônica)

Pacientes podem assinar termos de adesão avulsos, no mesmo formato da anamnese (assinatura eletrônica simples do paciente). O fluxo funciona assim:
1. O dentista envia a solicitação pela aba "Termo" na ficha do paciente.
2. O sistema dispara uma mensagem no WhatsApp do paciente com o link.
3. O paciente abre o link (`/termo-assinatura/[token]`), que **exige a digitação do CPF** para validar a identidade antes de exibir o documento.
4. Após o CPF ser validado no servidor, o paciente lê o termo e assina na tela do celular/computador.
5. O PDF do termo é gerado automaticamente, guardado na aba do paciente, e fica com a trilha de auditoria (IP, Hash, Data/Hora).

O modelo de texto base do termo de adesão fica centralizado em `/dashboard/configuracoes`, preenchendo automaticamente as variáveis da clínica e do paciente.

## Contra-assinatura da dentista (anamnese e evolução clínica)

Além da assinatura eletrônica simples do paciente (seção acima), a dentista pode contra-assinar a anamnese e a evolução clínica com certificado ICP-Brasil (mesmo provider trocável de `lib/signature/index.ts` usado por atestados/prescrições — normalmente `local_agent`). O resultado é **um único PDF com as duas assinaturas**, não dois arquivos separados: `issueAnamnesisDentistSignature`/`issueEvolutionDentistSignature` carregam o PDF que o paciente já assinou (`PDFDocument.load`) e aplicam a assinatura da dentista em cima dele, em vez de gerar um documento novo do zero.

Isso só é seguro quando o paciente assina **primeiro** — colar conteúdo depois de uma assinatura ICP-Brasil já embutida invalidaria o hash/`ByteRange` dela, já que o `pdf-lib` reserializa o arquivo inteiro ao salvar (não faz incremental update de verdade). Por isso a ordem é diferente em cada documento:

- **Anamnese**: o paciente sempre assina primeiro (na hora, ao preencher) — a contra-assinatura da dentista é sempre segura e pode acontecer a qualquer momento depois.
- **Evolução clínica**: a ordem foi invertida especificamente por causa disso. Finalizar um tratamento já dispara automaticamente o pedido de assinatura ao paciente por WhatsApp (`requestEvolutionSignature`, chamado em `POST /api/clinics/[clinicId]/treatments/finalize`) — a contra-assinatura da dentista (botão "Assinar como dentista", em `TreatmentDetailModal.tsx`/`EvolucoesPendentesClient.tsx`) só fica habilitada depois que o paciente confirma (`signature_status === "assinada"`); antes disso, some da lista de "evoluções pendentes" e aparece desabilitada com o aviso "Aguardando o paciente assinar".

Depois que a dentista assina, o paciente recebe um WhatsApp com o link do portal de validação pública correspondente — `/validar-anamnese/[code]` ou `/validar-evolucao/[code]` (código em `signatures.verification_code`/`treatment_evolution_signatures.verification_code`) — com um botão de download real do PDF final, além da conferência de hash SHA-256 já existente.

## Assinatura digital de atestados/prescrições (Certisign)

Diferente da assinatura eletrônica simples da anamnese (seção acima), atestados e prescrições exigem assinatura com certificado ICP-Brasil da dentista responsável (CRO). O provider é trocável e centralizado em `lib/signature/index.ts` (`getSignatureProvider()`, `SIGNATURE_PROVIDER=mock|certisign|psc|local_agent` — as duas últimas opções estão documentadas mais abaixo, "Assinatura em Nuvem Direta" e "Agente local de assinatura"). Esta seção cobre a opção `certisign` (Portal de Assinaturas, A3 em nuvem via RemoteID).

Fluxo real (Certisign), assíncrono por natureza — a dentista precisa confirmar a assinatura no app dela (PIN/biometria):
1. `issueCertificate`/`issuePrescription` gera o PDF e chama `provider.requestSignature()`, que sobe o documento (`document/upload`) e cria o fluxo de assinatura (`document/create`, signatário no array `signers`, nunca `serverSigners` — a assinatura tem que ser pessoal da dentista, não automática via certificado de empresa). O registro fica `aguardando_assinatura`, com `signature_sign_url` (link pra ela assinar) e `signature_provider_doc_id` salvos.
2. O dashboard mostra o botão "Assinar agora" (abre `signature_sign_url`) e faz polling leve (`router.refresh()` a cada 6s) enquanto pendente — ver `CertificateActions`/`PrescriptionActions`.
3. Quando ela assina, a Certisign chama `POST /api/webhooks/certisign` (configurar no painel do Portal de Assinaturas com trigger `FLOW`) — esse é o caminho **autoritativo** de conclusão. O payload já traz `apiDownload`, uma URL pronta com a `key` certa pra baixar o PDF assinado (não confundir com o `id` do documento — são valores diferentes). Proteger o endpoint registrando um header customizado no callback com o valor de `CERTISIGN_WEBHOOK_SECRET`.
4. `GET /api/cron/check-signatures` (Vercel Cron, protegido por `CRON_SECRET`) é só uma rede de segurança — reconsulta `document/flowActions` pros pendentes, pro caso do webhook falhar; nesse caminho a `key` do `document/package` é "chutada" como o `id` do documento, então pode não resolver mesmo com a assinatura já concluída (fica `pendente`, sem virar `falha`).

Pendências que só dá pra confirmar testando no sandbox/com o suporte da Certisign antes de ir pra produção:
- Valor numérico do enum `PadraoAssinatura` (campo `signatureStandard` em `document/create`) correto pra PAdES (é o que evita `document/package` devolver um zip CAdES+manifesto+.p7s). Confirmado pela doc oficial que o campo se chama `signatureStandard`, não `signatureFormatId` (nome antigo, corrigido — não existia na API real).
- `flowActions` e `package` (usados no fallback de reconciliação — cron e botão "Verificar assinatura agora") não aparecem no catálogo público do portal do desenvolvedor (só `upload`/`create`/`createBatch` estão documentados lá). Testar isolado com curl antes de confiar nesse caminho — se não existirem nesse formato, só o webhook resolve a assinatura.
- Se a página de assinatura (`signUrl`) funciona sem o plugin Chrome quando a signatária usa certificado RemoteID em nuvem — a doc da Certisign menciona um plugin Chrome pra listar certificados locais, o que não deveria se aplicar ao fluxo mobile/RemoteID, mas vale confirmar com o suporte antes de liberar pra dentista assinar pelo iPhone.

## Assinatura em Nuvem Direta (PSC/VaultID, `SIGNATURE_PROVIDER=psc`)

Quarta variação de provider, diferente da Certisign Portal (seção acima) por ser **síncrona**: a clínica vincula uma vez o certificado em nuvem da dentista (`GET /api/auth/certisign?clinicId=...` → OAuth do PSC/VaultID via `lib/psc/PscClient.ts` → `GET /api/auth/certisign/callback` grava `psc_access_token`/`psc_certificate_alias`/`psc_certificate_pem` em `clinics`), e depois disso cada emissão assina o PDF na hora (`lib/signature/pscProvider.ts`, `PscSigner`), sem passar por `aguardando_assinatura`/webhook/polling como a Certisign Portal ou o `local_agent`. **Ainda não tem botão no painel** pra iniciar esse vínculo (`/dashboard/configuracoes` não expõe esse link hoje) — usar essa rota exige chamar a URL de vínculo diretamente.

## Agente local de assinatura (ICP-Brasil, `SIGNATURE_PROVIDER=local_agent`)

Terceira opção de provider (além de `certisign` e `psc` acima), pensada pra dentista que já tem um certificado A1/A3 instalado no Windows dela (e-CPF ICP-Brasil no repositório de certificados do Windows) em vez de um certificado em nuvem. Diferente dos providers de nuvem, a chave privada nunca sai da máquina da dentista — quem assina de fato é um agente rodando localmente, não o servidor.

- **O agente** (pasta `agent/` na raiz do repo, fora de `app/`): app Windows (.NET 8, WinForms + Kestrel) que roda na bandeja do sistema e expõe uma API HTTP só em `http://127.0.0.1:52310` (nunca exposta externamente). Lê o repositório de certificados do Windows (`CurrentUser\My`), filtra só certificados ICP-Brasil válidos com chave privada, e assina hashes sob demanda (`POST /v1/sign`) usando a chave privada local — nunca a expõe. Instalador em `agent/installer/` (`Instalar.bat`), builda/empacota via `agent/pack.ps1`, distribuído como asset de uma GitHub Release (link de download configurado em `dashboard/configuracoes/page.tsx`, `AGENT_INSTALLER_URL` — atualizar essa constante a cada nova release do agente).
- **Fluxo de assinatura** (`lib/signature/localAgentProvider.ts` + `deferredSigning.ts`): é assíncrono em duas etapas, mesmo sendo tudo local — `requestSignature()` no servidor prepara o PDF (rodapé de assinatura + placeholder CMS/PKCS#7 vazio), calcula o hash exato dos `authenticatedAttributes` em DER canônico, salva uma sessão temporária (`signature_sessions`, migração `047_signature_sessions.sql`) e devolve `{ status: "external_signing", hashToSignBase64, signatureSessionId }` pro navegador. O navegador chama o agente local direto (`AgentDetector.tsx` → `useAgent()`) pra assinar esse hash com a chave privada real, e manda o resultado de volta pro servidor (`POST .../sign-local/finish`), que reconstrói o SignerInfo do PKCS#7 reaproveitando os mesmos bytes DER que foram hasheados (não dá pra deixar o `node-forge` gerar o ASN.1 e só trocar a assinatura depois — ele assina com uma chave descartável internamente nesse processo, e reatribuir `signer.signature` depois não tem efeito nenhum na saída final).
- **Na UI**, `NewCertificateForm`/`NewPrescriptionForm` só mostram o seletor de certificado do agente (`AgentCertificateSelector`) quando `NEXT_PUBLIC_SIGNATURE_PROVIDER === "local_agent"` — certificados cujo CPF não bate com o CPF cadastrado da dentista aparecem desabilitados ("CPF incompatível").

## Painel mobile / PWA

`ClinicShell`/`shell.module.css` tem um layout mobile dedicado (só dentro de `@media`, não muda nada no desktop nem no `AdminShell`, que é uma folha de estilo separada e continua desktop-only):
- Sidebar de desktop vira uma barra superior enxuta (logo + Sair); a navegação principal (`.nav`) sai do fluxo normal via `position: fixed` e vira uma barra fixa no rodapé — padrão de app mobile, sem menu hambúrguer.
- Tabelas (`.table`) ganham `display: block; overflow-x: auto` em telas pequenas, pra rolar horizontalmente em vez de ficar cortadas pelo `overflow: hidden` do `.panel`.
- `env(safe-area-inset-top/bottom)` no padding da barra superior e inferior — necessário porque `viewport-fit: cover` (ver `layout.tsx`) faz o conteúdo ocupar a área do notch/status bar em modo standalone; sem essa compensação o relógio/ícones do iPhone ficam por cima do conteúdo.

**PWA**: `app/manifest.ts` (não duplicar com `metadata.manifest` no `layout.tsx` — isso já causou um `crossorigin="use-credentials"` indevido no `<link rel="manifest">` numa tentativa anterior) + `appleWebApp` em `metadata` fazem o app instalar em modo `display: standalone` (sem barra de endereço) ao adicionar à tela de início no iOS/Android. Ícones em `public/icons/` (192/512/apple-touch-icon 180) são gerados programaticamente (ver histórico do repo) — trocar por uma logo de marca real é só substituir os PNGs com os mesmos nomes. `middleware.ts` exclui `/icons` e `/manifest.webmanifest` do matcher pra não rodar a checagem de sessão do Supabase em asset estático. iOS só aplica a config de instalação no momento de "Adicionar à Tela de Início" — reinstalar é necessário depois de mudanças nesses arquivos.

## Componentes de UI compartilhados (`src/components/ui/`)

`ConfirmDialog` (modal de confirmação) e `ToastStack`/`useToasts` (mensagens de erro/sucesso) substituem os `confirm()`/`alert()` nativos do navegador em toda ação destrutiva do painel (cancelar assinatura, cancelar anamnese, cancelar troca de plano). Use esses componentes em vez de `confirm()`/`alert()` ao adicionar novas ações desse tipo.

## Integração com a Evolution API — pontos não óbvios

- `POST /webhook/set/{instance}` espera o payload **aninhado**: `{"webhook": {"enabled": true, "url": ..., "events": [...]}}`. Algumas versões da documentação mostram um formato achatado (`{"enabled": true, "url": ...}`) que retorna 400 nessa instância — ver `lib/evolutionAdmin.ts`.
- `setInstanceWebhook` (que registra essa URL) só é chamado no momento de **conectar/escanear o QR** (`/api/clinics/[clinicId]/whatsapp/connect`). Trocar `NEXT_PUBLIC_APP_URL` depois de uma clínica já estar conectada **não** atualiza o webhook sozinho — é preciso reconectar (ou usar "Trocar número" em `/dashboard/configuracoes`, que desconecta via `logoutInstance`/`DELETE /instance/logout/{instance}` — endpoint não verificado contra uma instância real ainda) ou chamar `setInstanceWebhook` manualmente com a URL nova.
- A rota `/api/webhooks/evolution/[instanceName]` loga (via `console.log`) cada caso em que ignora uma mensagem recebida (payload não reconhecido, clínica não encontrada, nenhuma conversa ativa pro telefone) — útil pra depurar pelos logs de produção quando uma resposta não avança a conversa.
- **Celular brasileiro, 9º dígito**: o WhatsApp/Baileys às vezes entrega o `remoteJid` sem o "9" do celular (ex.: `557998616410` em vez de `5579998616410`), de forma inconsistente. `brPhoneVariants` (`lib/validation.ts`) gera as duas variantes possíveis, e o webhook busca a conversa ativa com `.in("patient_phone", variants)` em vez de igualdade exata — sem isso, respostas reais do paciente não batiam com a conversa criada.
- Anamnese em andamento parada: `/dashboard` tem "Reenviar pergunta" (reenvia a pergunta atual, sem mudar `current_index`) e, se cancelada, "Retomar" (volta pra `active` mantendo `current_index`/`answers` e reenvia) — rotas em `/api/clinics/[clinicId]/conversations/[conversationId]/resend`.
