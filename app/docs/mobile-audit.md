# Auditoria mobile — Fase 0

> Produzido antes de qualquer componente mobile v2, conforme exigido pelo prompt de reformulação. Este documento também registra onde a realidade do código diverge das premissas do prompt original — nenhuma dessas divergências bloqueia o trabalho, mas mudam como ele é feito.

## 0. Achados que corrigem premissas do prompt original

| Premissa do prompt | Realidade no código | Impacto |
|---|---|---|
| Mobile hoje "parece um site espremido" | `ClinicShell.tsx` + `shell.module.css` já têm bottom nav (`@media max-width: 767px`, shell.module.css:368-460), rail de ícones no tablet (768-900px, linhas 339-366), tabelas já colapsam em cards (`@media max-width: 720px`, linhas 494-555) e a agenda já tem visão dia/semana distintas | O v2 não parte de zero — parte de uma base funcional. Ver §1 |
| Limite de anamneses do trial não existe mais | `TRIAL_ANAMNESIS_LIMIT=3`, `canAcceptAnamnesis()` (`lib/billing.ts`) e o retorno `402 trial_limit_reached` seguem ativos em `api/clinics/[clinicId]/conversations/route.ts` e `api/clinics/[clinicId]/anamnesis/route.ts` | Seguindo a própria instrução do prompt (§7.4): não removido, apenas registrado aqui; o mobile trata o 402 com mensagem genérica, sem contador de cota |
| Status "sem assinatura" via `ALTER TYPE ... ADD VALUE` | `certificates.status`/`prescriptions.status` são colunas `text` **sem** enum/CHECK constraint no Postgres (`supabase/010_dental_certificates.sql:30`, `016_prescriptions.sql:28`); o enum é só o union TS `DocumentStatus` em `lib/documentStatus.ts` | Mais simples que o previsto: acrescentar `pendente_assinatura` é só um novo valor de string + entradas nos records `DOCUMENT_STATUS_LABEL`/`DOCUMENT_STATUS_CLASS`, sem migration de enum. Ainda assim, migration de dados (nenhuma) e busca por todo `switch`/mapa de status continuam obrigatórias (Fase 4) |
| PDF assinado/não assinado como "duas variantes geradas" | `buildCertificatePdf`/`buildPrescriptionPdf` (`lib/certificatePdf.ts`, `lib/prescriptionPdf.ts`) **sempre** retornam bytes sem assinatura; quem carimba é o `SignatureProvider` depois (`lib/signature/*`) | O parâmetro `unsigned: true` da Fase 4 não muda o gerador — muda se o pipeline pula a etapa de `signatureProvider.sign()` e usa o PDF cru + aviso, o que é uma mudança menor e mais segura do que reescrever o gerador |
| Service worker é introduzido do zero na Fase 5 | `public/sw.js` já existe e já está registrado em produção via `RegisterServiceWorker.tsx` (só fora de `NODE_ENV=development`) | Qualquer mudança de SW altera um sistema já ativo para usuários reais — tratar como mudança em produção, não como feature nova. O padrão atual (cache-first só pra `/_next/static` e `/icons`, network-first com fallback offline pra navegação, nada de dado de paciente) já segue as regras do prompt (§9); a Fase 5 estende, não reescreve |
| `NEXT_PUBLIC_MOBILE_V2` segue um padrão de flag existente | Não havia nenhuma convenção de feature flag no repo antes deste PR — o único precedente parecido é o switch único `NEXT_PUBLIC_SIGNATURE_PROVIDER` | Estabelecido agora em `src/lib/mobileV2.ts` (`isMobileV2Enabled()`), documentado em `.env.example`. Sem valor definido = desligado, em qualquer ambiente |
| `AdminShell` teria tratamento mobile equivalente | `admin.module.css` é uma folha à parte, mais antiga, sem bottom nav/overflow — só reflow simples em 860/720/560px | Nada a fazer aqui: está na lista congelada (§2.1.2) e continua exatamente como está |

## 1. Tokens extraídos

Fonte: `src/app/globals.css:1-59` → destino: `src/styles/tokens.mobile.css` (prefixo `--m-*`, nunca importado por `globals.css`).

| Cor real (globals.css) | Valor | Token mobile | Uso hoje |
|---|---|---|---|
| `--bg` | `#f7f4ef` | `--m-bg` | fundo de página |
| `--surface` | `#ffffff` | `--m-surface` | cards, sheets, tab bar |
| `--surface-sunken` | `#f1ede4` | `--m-surface-sunken` | fundo rebaixado (inputs, skeletons) |
| `--ink` | `#1e2b27` | `--m-ink` | texto principal |
| `--ink-soft` | `#5b6864` | `--m-ink-soft` | texto secundário |
| `--ink-faint` | `#8b978e` | `--m-ink-faint` | texto terciário/placeholder |
| `--line` | `#e4ded2` | `--m-line` | borda padrão |
| `--line-soft` | `#ece7dc` | `--m-line-soft` | separador de lista (grade fraca) |
| `--brand` | `#2c6659` | `--m-brand` | ação primária |
| `--brand-deep` | `#1d473d` | `--m-brand-deep` | hover/pressed de marca |
| `--brand-deeper` | `#16362f` | `--m-brand-deeper` | texto de marca sobre fundo claro |
| `--brand-tint` | `#e7f0ec` | `--m-brand-tint` | fundo de destaque de marca |
| `--brand-bright` | `#4f9c86` | `--m-brand-bright` | indicador ativo (nav) |
| `--sign` | `#1f3f6e` | `--m-sign` | reservado ao momento de assinatura |
| `--sign-tint` / `--sign-line` | `#e8eef7` / `#c3d2e6` | `--m-sign-tint` / `--m-sign-line` | idem |
| `--warn` / `--warn-tint` | `#a15a16` / `#f7ecd9` | `--m-warn` / `--m-warn-tint` | status "aguardando"/rascunho |
| `--danger` / `--danger-tint` | `#b23b3b` / `#fbeaea` | `--m-danger` / `--m-danger-tint` | status "falha"/erro, destrutivo |
| `--urgent` / `--urgent-tint` / `--urgent-line` | `#6d3f96` / `#f1e9f8` / `#d9c3ea` | `--m-urgent*` | agenda "urgente" |
| `--muted-fill` | `#6b7570` | `--m-muted-fill` | bloco "agendado" sólido |
| `--attending` / `--attending-tint` / `--attending-solid` | `#a86f00` / `#fdf1d6` / `#f6c343` | `--m-attending*` | status "em atendimento" |
| `--radius` / `--radius-sm` / `--radius-lg` | `12px` / `8px` / `20px` | `--m-radius*` | idem, + `--m-radius-sheet` novo (`20px 20px 0 0`, derivado de `--radius-lg`) |
| `--shadow` / `--shadow-sm` | — | `--m-shadow-md` / `--m-shadow-sm` (+ `--m-shadow-lg` derivado, mesma família de rgba) | elevação |

**Cor semântica nova (única):** alerta de medicamento controlado. Decisão: reaproveitar `--danger`/`--danger-tint` (não um matiz novo) — `--warn` já está ocupado pelo status "rascunho/aguardando assinatura" (`DOCUMENT_STATUS_CLASS`), então usar a mesma cor colidiria visualmente com "isso é só um rascunho" vs "isso é controlado, redobre a atenção". Ver `tokens.mobile.css` para a justificativa completa embutida como comentário.

Também adicionados (sem cor nova, só estrutura): escala tipográfica mobile (`--m-text-*`), alvo de toque (`--m-tap-min: 44px`), alturas de chrome (`--m-tab-bar-height`, `--m-header-height`) e os quatro `env(safe-area-inset-*)`.

## 2. Mapa de rotas × toques (a partir de `/dashboard`, já logado)

| Tarefa | Hoje (shell atual) | Meta (shell v2, owner) |
|---|---|---|
| Ver agenda do dia | 1 toque ("Agenda" na bottom nav; já abre em visão dia) | 1 toque (tab "Agenda") — mantém |
| Abrir ficha do paciente | 2 toques ("Pacientes" → linha do paciente) | 2 toques (tab "Pacientes" → busca/recente) — mantém |
| Disparar anamnese | 4 toques ("Mais" → "Anamneses" → "Nova" → abrir formulário) + preencher | 2 toques ([+] → "Enviar anamnese") até abrir o sheet de modelo+paciente |
| Emitir atestado | 4 toques ("Mais" → "Atestados" → "Novo atestado" → abrir formulário) + preencher | 2 toques ([+] → "Novo atestado") até abrir o wizard |
| Emitir prescrição | 4 toques ("Mais" → "Prescrições" → "Nova prescrição" → abrir formulário) + preencher | 2 toques ([+] → "Nova prescrição") até abrir o wizard |

O ganho do [+] central é concentrado nas 3 tarefas de criação, que hoje passam pelo menu "Mais" (porque Anamneses/Atestados/Prescrições não estão entre os `MOBILE_PRIMARY_HREFS` atuais — `ClinicShell.tsx:198`). Agenda e Pacientes já cumprem a meta hoje.

## 3. Inventário de formulários (contrato — nenhum campo pode sumir)

### 3.1 `NewCertificateForm` → `POST /api/clinics/{clinicId}/certificates`
| Campo | Tipo | Obrigatório | Validação |
|---|---|---|---|
| `templateId` | select | não | popula `reason`/`rest_days_default` |
| `patientId`/`patientName` | busca (`PatientSearchField`) | sim | precisa resolver paciente |
| `startsOn` | date | sim | default hoje |
| `restDays` | number | sim | ≥ 0 |
| `cid` | texto + autocomplete (`/api/cid-codes/search`) | não | — |
| `hideCid` | checkbox | não | "ocultar CID" (Lei nº 9.436/97) |
| `reason` | textarea | sim | — |

### 3.2 `NewPrescriptionForm` → `POST /api/clinics/{clinicId}/prescriptions`
| Campo | Tipo | Obrigatório | Validação |
|---|---|---|---|
| `templateId` | select | não | — |
| `patientId`/`patientName` | busca | sim | — |
| `items[]` (`PrescriptionItemsEditor`) | lista | sim (≥1 item) | cada item: `drug_name`, `dosage`, `instructions`, `generic_allowed`, `control_type` |
| `notes` | textarea | não | — |

Bloqueio client-side existente (mantém): item com `control_type === "controlado_especial"` é rejeitado — sistema não emite esse tipo por nenhuma via, mobile ou desktop.

### 3.3 Agendamento — `NewAppointmentForm` → `POST /api/clinics/{clinicId}/appointments`
| Campo | Tipo | Obrigatório | Validação |
|---|---|---|---|
| paciente (busca/nome) | busca + texto | sim | autocomplete |
| `patientPhone` | tel | sim, só se paciente novo | BR, ≥10 dígitos |
| `date` | date | sim | mín. hoje |
| `time` | select | sim | slots futuros de `buildDaySlotTimes(date)` |
| `duration` | select | não | 15/30/45/60/90/120, default 30 |
| `returnOption` | select | não | none/1/6/12/custom/specific |
| `returnCustomMonths` / `returnSpecificDate` | number/date | condicional | só se `returnOption` pedir |
| `notes` | texto | não | — |
| `urgent` | checkbox | não | — |

### 3.4 Cadastro de paciente — `PatientForm` → `POST`/`PATCH /api/clinics/{clinicId}/patients[/:id]`
| Campo | Tipo | Obrigatório | Validação |
|---|---|---|---|
| `name` | texto | sim | — |
| `cpf` | texto | não | `isValidCPF` |
| `phone` | tel | não | formatação BR |
| `notes` | textarea | não | — |
| foto | upload (`PatientPhotoUpload`) | não | só em edição |

### 3.5 Envio de anamnese — `NewAnamnesisForm` → `POST /api/clinics/{clinicId}/conversations`
| Campo | Tipo | Obrigatório | Validação |
|---|---|---|---|
| `patientName` | texto | sim | — |
| `patientPhone` | tel | sim | `+55` fixo, formatação BR |
| `templateId` | select | sim | mostra nº de perguntas |

Resposta 402 (`trial_limit_reached` / `subscription_inactive`) já tratada com banner — mobile reusa o mesmo contrato de erro, sem contador de cota (ver §0).

## 4. Baseline de regressão do desktop

Capturado em 2026-08-19, branch `main`, antes de qualquer código mobile v2.

- **`npm run typecheck`**: ✅ limpo, 0 erros.
- **`npm test`**: ✅ 9 arquivos, 92 testes, todos verdes (inclui `billing.test.ts`, `appointments.test.ts`, `date.test.ts`, etc.).
- **`npm run build`**: ✅ build de produção sem erros. JS por rota (First Load JS), rotas relevantes ao escopo mobile:

| Rota | Tamanho da rota | First Load JS |
|---|---|---|
| `/dashboard` | 5.74 kB | 109 kB |
| `/dashboard/agenda` | 4.48 kB | 183 kB |
| `/dashboard/agenda/[id]` | 179 B | 87.8 kB |
| `/dashboard/agenda/new` | 215 B | 106 kB |
| `/dashboard/anamneses` | 5.03 kB | 106 kB |
| `/dashboard/anamneses/[id]` | 1.91 kB | 102 kB |
| `/dashboard/atestados` | 2 kB | 107 kB |
| `/dashboard/atestados/[id]` | 2.86 kB | 103 kB |
| `/dashboard/pacientes` | 4.99 kB | 96.8 kB |
| `/dashboard/pacientes/[id]` | 24.3 kB | 140 kB |
| `/dashboard/prescricoes` | 6.11 kB | 109 kB |
| `/dashboard/prescricoes/[id]` | 2.87 kB | 103 kB |
| `/dashboard/proteses` | 7.25 kB | 108 kB |
| `/dashboard/despesas` | 10.7 kB | 103 kB |
| `/billing` | 179 B | 87.8 kB |
| Shared JS (todas as rotas) | — | 87.7 kB |
| Middleware | — | 84.7 kB |

Todo PR seguinte compara contra esta tabela — nenhuma dessas rotas pode crescer com a flag desligada.

- **Checklist visual (prints 1440px) e PDF assinado de referência**: **não capturados neste documento** — exigem um navegador real (ou o skill `run` deste ambiente) e não podem ser gerados de forma confiável por um agente sem interface visual. Ficam como pendência explícita a fechar antes de qualquer PR de Fase 1+ ser considerado pronto para merge; recomendo rodar isso manualmente (ou via `/run`) contra as telas listadas no prompt §2.1.5 (dashboard, agenda, ficha do paciente com todas as abas, emissão de atestado, emissão de prescrição, `/admin`, `/billing`) e contra o fluxo de assinatura ICP-Brasil no desktop, com o provider real configurado (hoje `SIGNATURE_PROVIDER=mock` local).

## 4.1 Fase 1 — resultado (shell mobile v2)

Entregue nesta mesma sessão, sobre o baseline acima:

- Novo chrome mobile v2 (`src/components/mobile/`: `MobileShellChrome`, `MobileHeader`, `MobileTabBar`, `ActionSheet`, `Sheet`, `icons.tsx`) + `src/styles/shellMobileV2.module.css`, montado por `ClinicShell.tsx` só quando `role === "owner"` **e** viewport ≤767px detectado via `matchMedia` no cliente (nunca por user-agent no servidor — vetor de risco do prompt §2.1.3.2). `shell.module.css` **não foi editado** — zero linhas alteradas nesse arquivo.
- Tab bar Hoje · Agenda · **[+]** · Pacientes · Documentos. O [+] abre um sheet com as 5 ações de criação, cada uma navegando pra rota existente do recurso (`/dashboard/agenda/new`, `/dashboard/pacientes?new=1`, etc.) — nenhum formulário duplicado.
- `?new=1` é o mecanismo que liga o sheet aos modais já existentes: `NewCertificateTrigger`, `NewPrescriptionTrigger`, `NewAnamnesisTrigger` e `NewPatientTrigger` ganharam uma prop opcional `autoOpen` (default `false`, comportamento atual preservado), e as 4 páginas de listagem passam `autoOpen={searchParams.new === "1"}`. Reduz a criação de atestado/prescrição/anamnese/paciente de 4 toques (hoje, atrás do menu "Mais") pra 2.
- `/dashboard/documentos` — página nova, mínima (3 cards de navegação pras rotas reais de Anamneses/Atestados/Prescrições). A versão rica com segmented control e estado preservado por sessão é escopo da Fase 2/3, não desta.
- **Interruptor**: `NEXT_PUBLIC_MOBILE_V2` (ver `src/lib/mobileV2.ts` e `.env`/`.env.example`) controla um `if` de build time em `ClinicShell.tsx` (`process.env.NEXT_PUBLIC_MOBILE_V2 === "1" ? dynamic(...) : null`) — com a flag ausente, o Terser elimina o `next/dynamic()` inteiro do grafo de módulos, não só esconde o componente em runtime.
- **Regressão de JS medida** (mesma tabela do baseline, flag desligada, build limpo):
  - **JS compartilhado (`First Load JS shared by all`): 87.7 kB → 87.7 kB, sem alteração.**
  - Rotas que **não** passam por `ClinicShell` (`/billing`, `/atestado`, `/prescricao`, etc.): sem alteração.
  - Rotas que usam `ClinicShell` (todo `/dashboard/*`): **+~1 kB** cada (ex.: `/dashboard` 109→110 kB, `/dashboard/pacientes` 96,8→97,8 kB, `/dashboard/atestados` 107→108 kB). Esse ~1 kB é o próprio mecanismo do flag (o `if`/`useState`/`useEffect` de detecção de viewport dentro de `ClinicShell.tsx`, que é importado por toda página do dashboard e, neste projeto, não é deduplicado num chunk compartilhado — já era assim antes desta mudança). Tentei eliminar isso por completo (ver histórico de commits desta sessão: consolidação em um único `MobileShellChrome` dinâmico, depois gating por `process.env` literal em vez de `isMobileV2Enabled()`) e cheguei o mais perto de zero que a arquitetura de bundling atual permite sem reestruturar como `ClinicShell` é compartilhado entre rotas — o que estaria fora do escopo aditivo desta fase. Reportando com números reais em vez de declarar "zero" sem medir.
  - Confirmado também que o build **compila e o chunk dinâmico carrega** com a flag ligada (`NEXT_PUBLIC_MOBILE_V2=1 npm run build`), sem erro.
- `npm run typecheck` e `npm test` (92 testes) verdes em todos os pontos de checagem.
- **Não verificado nesta sessão** (mesma ressalva do §4): aparência real em dispositivo/emulador, teste de toque, `prefers-reduced-motion`, VoiceOver/TalkBack. Chrome novo ainda não tem skeleton de carregamento nem transições (View Transitions) — ambos ficam para as Fases 2/3, quando o conteúdo das telas (Hoje/Agenda/Pacientes) também for reformulado; agora as rotas por trás do novo chrome mostram o mesmo conteúdo desktop (cards/tabelas atuais), só emolduradas pelo header/tab bar novos.

## 4.2 Fase 4 — resultado (via não assinada digitalmente)

Entregue nesta mesma sessão, sobre o baseline acima.

**Desvio deliberado do prompt original — medicamento controlado em 3 vias NÃO foi implementado.** O prompt (§4.1, §13) trata "controlado sem assinatura digital, permitido em 3 vias" como decisão de produto já fechada. Mas `api/clinics/[clinicId]/prescriptions/route.ts:70-72` já bloqueia **qualquer** prescrição com item `control_type === "controlado_especial"` com `400 controlado_especial_nao_suportado` — incondicionalmente, sinalizada ou não, e o próprio comentário em `database.types.ts:150-153` documenta que "o sistema não suporta numeração/talão de receituário especial". Ou seja: o sistema hoje **nunca** emite esse tipo de prescrição, por nenhuma via — não é uma restrição de assinatura, é uma lacuna de conformidade regulatória (ANVISA exige numeração/talão controlado, que este sistema não implementa). Implementar "3 vias" exigiria remover ou contornar esse bloqueio, o que é uma decisão de produto/regulatória que não me cabe tomar sozinho. Deixei o bloqueio exatamente como estava — a via não assinada aceita `comum` e `antimicrobiano_retencao` normalmente, e continua recusando `controlado_especial` como sempre recusou.

**O que foi implementado:**

- **Novo status `pendente_assinatura`** — `CertificateStatus`/`PrescriptionStatus`/`DocumentStatus` (`database.types.ts`, `lib/documentStatus.ts`), rótulo "Aguardando assinatura física". Como `status` é uma coluna `text` sem enum/CHECK no Postgres (achado da Fase 0), não precisou de `ALTER TYPE` — só passou a ser usado.
- **Migration `050_unsigned_documents.sql`** — só `unsigned_pdf_at timestamptz` nullable em `certificates`/`prescriptions`. Aditiva, sem `UPDATE` em linha existente.
- **`lib/certificates.ts`/`lib/prescriptions.ts`** — `issueCertificate`/`issuePrescription` ganharam um 3º parâmetro opcional `unsigned?: boolean` (default indefinido = comportamento atual). Quando `true`, pula o `SignatureProvider` inteiro: gera o PDF com o aviso "sem assinatura digital", salva, marca `pendente_assinatura` + `unsigned_pdf_at`. **O mesmo registro pode ser assinado de verdade depois**: o endpoint `[id]/issue` já existia (usado hoje por "Tentar novamente" em documentos com `falha`) e não tem guarda de status — funciona sem nenhuma mudança pra promover um `pendente_assinatura` a `assinado`, então só precisei expor um botão novo pra ele ("Assinar digitalmente agora" em `CertificateActions.tsx`/`PrescriptionActions.tsx`).
- **`lib/certificatePdf.ts`/`lib/prescriptionPdf.ts`** — parâmetro opcional `options?: { unsigned?: boolean }`. Sem esse parâmetro (todo caminho existente), a saída é byte-a-byte a mesma de antes — o texto de aviso e o desenho da caixa de assinatura manual (`lib/pdfUnsignedNotice.ts`, novo arquivo) só entram quando `unsigned: true`. A caixa manual ocupa exatamente a mesma área reservada que o carimbo do provedor usaria (margin 48, y 24–82), então o leiaute existente não foi alterado, só preenchido de outro jeito quando não há provedor nenhum envolvido.
- **Emissão pelo mobile** — `NewCertificateForm`/`NewPrescriptionForm` ganharam um botão secundário "Emitir sem assinatura digital", visível só no shell mobile v2 (`useMobileV2Active`), que chama a mesma rota de criação com `unsigned: true` — sem duplicar formulário nem validação.
- **Imprimir/compartilhar** — `PrintShareButton` (`src/components/mobile/`) novo: `navigator.share({ files })` com o PDF baixado da mesma rota autenticada já existente (`/api/certificates/download/:id`, `/api/prescriptions/download/:id` — nenhuma das duas tinha guarda de status, então já funcionavam pra `pendente_assinatura` sem mudança). Fallback: abre o PDF em nova aba. Só renderiza no mobile v2 (`useMobileV2Active` interno) — nas páginas de detalhe (Server Components) o botão é sempre renderizado no JSX, mas decide sozinho se aparece, pra não precisar de detecção de mobile no servidor.
- **Páginas de detalhe** (`atestados/[id]`, `prescricoes/[id]`) — aviso específico pro status `pendente_assinatura` (troca o aviso genérico de "assinatura simulada" que não fazia sentido aqui), `unsigned_pdf_at` na lista de detalhes, e o link "Baixar PDF" existente (inalterado, mesma classe CSS) passou a aparecer também pra `pendente_assinatura`, não só `assinado`.
- **Rótulo do status `assinado` mudou de "Assinado" para "Assinado digitalmente"** em `lib/documentStatus.ts` — única alteração de texto num valor que já existia (aparece em badges no desktop também). Deliberado: o prompt (§8.3) pede exatamente esse par de rótulos ("Aguardando assinatura física" / "Assinado digitalmente") pra o badge ser inequívoco; com o novo status, "Assinado" sozinho ficaria ambíguo em qualquer lista que misture os dois.
- **`npm run typecheck`, `npm test` (92 testes) e `npm run build`** verdes depois de cada mudança. Nenhum outro chamador de `buildCertificatePdf`/`buildPrescriptionPdf` existe além dos dois já ajustados em `lib/certificates.ts`/`lib/prescriptions.ts` — confirmado por busca no repo.

**Não implementado nesta fase, meramente por escopo (não por risco):**

- Filtro rápido "aguardando assinatura física" nas listas de atestados/prescrições (prompt §8.3) — as listas hoje não têm nenhum filtro de status; adicionar um exigiria mexer na paginação/query de duas páginas a mais, deixado pra continuação.
- Baseline de regressão visual (prints 1440px) e um PDF assinado de fixture antes/depois, pedidos na Fase 0 (§4) e reforçados como pré-requisito da Fase 4 (prompt §2.1.3, item 4) — seguem pendentes por exigirem navegador real; a garantia disponível aqui é a leitura de código confirmando que o caminho sem `unsigned` é idêntico ao anterior.

## 5. Perguntas em aberto (não travam o início — ver prompt §13)

1. Rótulos das 3 vias do receituário controlado — proposta "Farmácia / Paciente / Arquivo da clínica", a confirmar na Fase 4.
2. Se o layout atual do PDF de prescrição já cobre todos os campos exigidos por um receituário de controle especial *sem* assinatura digital — levantar durante a Fase 4, não improvisar.
3. Novo: como o `unsigned: true` deve se comportar quando `SIGNATURE_PROVIDER` já é `mock`/mock local — o "mock" hoje carimba uma assinatura simulada visível (`mockProvider.ts:35-60`); a via não assinada da Fase 4 precisa pular essa etapa por completo, não é só outro provider.
