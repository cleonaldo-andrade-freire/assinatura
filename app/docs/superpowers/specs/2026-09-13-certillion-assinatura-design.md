# Assinatura digital via Certillion — certificado A3 em nuvem, autorizado no celular

**Data:** 2026-09-13
**Status:** design em revisão — nada implementado
**Contexto anterior:** integração com a Certisign (Portal de Assinaturas) implementada em agosto/2026 e pausada sem teste real, bloqueada no tipo de conta da clínica. Este documento descreve um caminho diferente, que não depende daquele bloqueio.

---

## 1. Objetivo

Permitir que a dentista assine atestados com validade jurídica ICP-Brasil **autorizando pelo celular ou tablet**, usando o certificado A3 em nuvem que ela já possui (RemoteID, da Certisign), sem depender da máquina Windows do consultório com o token físico conectado.

Hoje a produção assina pelo **agente local** (`SIGNATURE_PROVIDER=local_agent`): funciona, mas prende a assinatura ao computador do consultório. A Certillion tira essa amarra.

## 2. Decisões tomadas

| Questão | Decisão |
|---|---|
| Certificado da dentista | RemoteID (Certisign) ativo — `psc=REMOTEID` |
| Escopo do produto | Multi-tenant desde já: cada clínica vincula o certificado da própria dentista |
| Autorização | Sessão longa (`scope=signature_session`), ~1 autorização por dia |
| Sem sessão válida | Falha visível e acionável no painel (sem fila, sem fallback automático) |
| Convivência | Por clínica, via `clinics.signature_provider`; agente local continua sendo o padrão |
| Primeira entrega | Atestado ponta a ponta, validado no verificador do ITI |

## 3. Descobertas técnicas que sustentam o design

1. **Certillion não é o Portal de Assinaturas.** São duas APIs da mesma empresa (e-Sec/Certisign). O código atual em `src/lib/signature/certisignClient.ts` fala com o Portal (`desenvolvedor.portaldeassinaturas.com.br`), cujo credenciamento exige conta empresarial — o bloqueio de agosto. A Certillion (`cloud.certillion.com`) tem credenciamento próprio e independente: credencial de teste solicitada em `certillion.com/fale-conosco`, grátis.
2. **O A3 em nuvem da Certisign é o RemoteID**, e `REMOTEID` consta na lista de PSCs aceitos pela Certillion (`VIDAAS, SAFEID, REMOTEID, NEOID, VAULTID, BIRDID, DSCLOUD, CERTILLION_SIGNER`). Cada uso exige autorização ativa por PIN ou biometria facial no app do celular.
3. **Sessão reaproveitável.** Com `scope=signature_session` e `lifetime` em segundos, o RemoteID admite sessão de até 24h. A duração efetiva é a que vier em `expires_in` — o `lifetime` é apenas sugestão e o PSC pode encurtar ou cancelar antes.
4. **Não existe ambiente sandbox.** Toda assinatura, inclusive de teste, é ICP-Brasil real e juridicamente válida. A chave de teste difere só nos limites: 90 dias de validade, 200 assinaturas/mês, 100 KB por arquivo.
5. **Limite de 100 KB é folgado para nós.** O PDF assinado atual tem ~18 KB.
6. **O rodapé de validação e o QR já são desenhados antes da assinatura** (`certificatePdf.ts:135`), o que atende à exigência da Certillion de que nada no PDF seja alterado depois de assinado.
7. **Custo por assinatura bem-sucedida**, com PAdES ~30% mais caro que CAdES (PDF exige PAdES). Repetir passos já concluídos por tratamento de erro preguiçoso é a principal causa prática de fatura inflada.

## 4. Arquitetura

### 4.1 Componentes novos

**`src/lib/certillion/CertillionClient.ts`** — camada HTTP pura contra `https://cloud.certillion.com/css/restful/application`. Sem Supabase, sem regra de negócio, testável com `fetch` mockado.

- `clientToken()` — autenticação do sistema integrador
- `userDiscovery(cpf, psc)` — checagem prévia: esse CPF tem conta nesse PSC?
- `buildAuthorizeUrl({ manager_id, code_challenge, psc, scope, lifetime, redirect_uri, state, login_hint })`
- `exchangeToken({ code, code_verifier, psc, redirect_uri })`
- `uploadDocument(token, bytes)` → `document_hash`
- `sign(signingToken, { signature_standard, signature_policy, pki_name, hashes })` → `transaction_id` + `signatures[]`
- `downloadDocument(token, transaction_id)` → bytes
- `validateSignature(clientToken, signatureBase64)` — verificação automática pós-assinatura

Formato exato de cada chamada: ver a seção 13, conferida contra a collection oficial.

Os três passos de assinatura ficam **deliberadamente separados**. Encapsulá-los num método único faz qualquer falha reiniciar o fluxo inteiro e recobrar upload e assinatura já concluídos.

**`src/lib/certillion/sessions.ts`** — ciclo de vida da sessão por clínica: `createPkcePair()`, `startAuthRequest(clinicId)`, `completeAuthRequest(state, code)`, `getValidSession(clinicId)`, `markSessionExpired(id)`, `revokeSession(id)`.

**`src/lib/signature/certillionProvider.ts`** — implementa o contrato `SignatureProvider` existente (`src/lib/signature/types.ts`). Orquestra os três passos com retomada individual; devolve `assinado` ou `falha`.

### 4.2 Rotas

- `GET /api/clinics/[clinicId]/certillion/authorize` — gera PKCE + state, persiste o auth request, devolve a URL de autorização (para QR e link)
- `GET /api/auth/certillion/callback` — troca o `code` por token, valida o CPF e grava a sessão
- `POST /api/clinics/[clinicId]/certillion/revoke` — revoga a sessão ativa

Não colidem com `/api/auth/certisign/*`, que pertence ao fluxo VaultID.

### 4.3 UI

Card **"Certificado digital"** nas configurações da clínica: estado da sessão (ativa até HH:MM / expirada / não vinculada), botão **Autorizar** exibindo QR code e link curto, CPF vinculado, botão **Revogar**. O aceite do termo de sessão longa acontece aqui, antes da primeira autorização.

Na tela do atestado, quando houver falha, um **"ver detalhes"** expõe o JSON bruto retornado pela Certillion com opção de copiar.

## 5. Modelo de dados

Migrations a partir de `069` (a última existente é `068_lead_alert_toggle.sql`).

**`certillion_sessions`** — tabela própria em vez de colunas em `clinics`, para ter histórico, auditoria e revogação em vez de um token sobrescrito.

```
id, clinic_id (fk), psc, authorized_cpf, access_token, expires_at,
scope, status ('ativa' | 'expirada' | 'revogada'), created_at, revoked_at
```

**`certillion_auth_requests`** — `state`, `code_verifier`, `clinic_id`, `expires_at`, `consumed_at`.
O `code_verifier` **não pode** ficar em cookie: a dentista abre o link no celular, fora do navegador onde o painel está logado. O `state` é o que costura o callback de volta à clínica certa.

**`certillion_signatures`** — auditoria: `document_type`, `document_id`, `session_id`, `document_hash`, `transaction_id`, `status_code`, `error_json`, `created_at`.

**`clinics`** — colunas novas: `signature_provider` (nullable), `certillion_psc` (default `'REMOTEID'`), `certillion_consent_at`.

**RLS:** as três tabelas novas ficam sem nenhuma policy — acesso exclusivo via service role. O `access_token` assina documentos com validade jurídica em nome da dentista e nunca pode chegar ao cliente.

> Atenção ao nome: `signature_sessions` (migration 047) já existe e pertence ao fluxo de assinatura diferida do agente local. São coisas distintas.

## 6. Fluxos

### 6.1 Vínculo do certificado

0. **Checagem prévia:** `POST /oauth/user-discovery` com o CPF da dentista e `psc=REMOTEID`. Se ela não tiver conta nesse PSC, o painel diz isso na hora, em vez de mandá-la bater numa tela de login que vai falhar.
1. Painel chama `/certillion/authorize`; o servidor gera `code_verifier` + `code_challenge` (S256) e um `state`, persiste em `certillion_auth_requests`.
2. Painel exibe QR code e link.
3. Dentista abre no celular → `GET /oauth/authorize` com `manager_id`, `code_challenge`, `code_challenge_method=S256`, `psc=REMOTEID`, `scope=signature_session`, `lifetime`, `redirect_uri`, `state` e **`login_hint` com o CPF dela** — isso trava a autorização no titular certo em vez de aceitar quem estiver logado no celular.
4. Ela autentica no app RemoteID com PIN ou biometria facial.
5. Callback em `/api/auth/certillion/callback?code=...&state=...`.
6. Servidor troca o code em `POST /oauth/token` (form-urlencoded) com `grant_type=authorization_code`, `code`, `code_verifier`, **`psc` (o mesmo do authorize)**, `redirect_uri` idêntico ao do authorize, e **os dois pares de credencial** — `client_id`/`client_secret` **e** `manager_id`/`manager_secret`, mesmos valores. Ver a nota da seção 13 sobre essa duplicidade.
7. Confere `authorized_identification` contra `clinics.dentist_cpf`. **Se não bater, recusa e não grava** — isso impede vincular silenciosamente o certificado da pessoa errada. O `login_hint` do passo 3 é a primeira barreira; esta é a segunda, e é a que não depende do comportamento do PSC.
8. Grava a sessão usando o `expires_in` retornado, nunca o `lifetime` pedido.

### 6.2 Assinatura do atestado

1. `requestCertificateSignature` monta o PDF como hoje, já com rodapé de validação e QR.
2. Provider busca sessão válida. **Sem sessão → `falha`** com mensagem acionável, que cai no `signature_error` já exibido em `dashboard/atestados/[id]/page.tsx:200`.
3. `POST /oauth/client_token` (`grant_type=client_credentials`, `client_id`, `client_secret`, `lifetime`).
4. `POST /oauth/document` → persiste o `document_hash` em `certillion_signatures` antes de seguir.
5. `POST /oauth/signature` com `signature_standard: PADES`, `signature_policy: AD_RB`, `pki_name: ICP_BR` → persiste o `transaction_id`.
6. **Verifica `status.code === 140` em cada entrada de `signatures[]`.** HTTP 200 não significa assinatura válida.
7. `GET /oauth/document/{transaction_id}` → bytes assinados.
8. Entrega ao `finishCertificateSignature`, que já existe e fecha o fluxo.

### 6.3 Convivência entre providers

`getSignatureProvider()` hoje é um switch global por variável de ambiente (`src/lib/signature/index.ts:16`). Passa a resolver **por clínica**:

- `getSignatureProvider(clinic)` — usa `clinic.signature_provider`; se nulo, cai no env var, que continua sendo `local_agent`.
- `getSignatureProviderByName(name)` — resolve pelo nome gravado na linha do documento.

Ligar a Certillion vira uma mudança de uma coluna na clínica piloto, sem deploy, reversível na hora. As demais clínicas seguem no agente local.

**Correção obrigatória junto:** `certificates.ts:182` e `prescriptions.ts:183` chamam `getSignatureProvider()` para *conferir* assinatura pendente, ou seja, usam o provider atual em vez daquele que originou o pedido — mesmo com `signature_provider` gravado na linha. Com um provider só isso nunca aparece; com dois convivendo, um atestado pedido no agente local passaria a ser consultado na Certillion e ficaria pendente para sempre. A reconciliação passa a usar `getSignatureProviderByName(row.signature_provider)`.

**Sem fallback automático.** Tentar a Certillion e cair no agente local em caso de falha misturaria a origem das assinaturas sem ninguém perceber, e cada chamada à Certillion é cobrada e gera assinatura real. Falha tem que ser visível.

## 7. Erros e controle de custo

Tratamento em três camadas:

1. **Preservar** o JSON original da Certillion (`status.code`, `status.name`, `status.detail`, HTTP status) em `certillion_signatures.error_json`, com o `transaction_id`.
2. **Mensagem específica** por código em `signature_error`: `218`/`212` sem créditos no PSC; `249`/`250` sessão expirada; `301` timeout do provedor; `620` certificado não encontrado; `400` cancelada. Código desconhecido → mensagem neutra, nunca um palpite fixo.
3. **"Ver detalhes"** na tela, expondo o JSON bruto com ação de copiar.

`401` com `249`/`250` marca a sessão como `expirada` e pede reautorização, em vez de falhar mudo.

**Retomada por passo**, porque é dinheiro: upload concluído e assinatura falhou → refaz só a assinatura com o `document_hash` persistido; assinatura concluída e download falhou → refaz só o download com o `transaction_id`. Nunca reiniciar do passo 1.

**Guardrail de ambiente:** `CERTILLION_ENV=test|production`. Em teste, aviso visível dos limites (90 dias, 200 assinaturas/mês, 100 KB) e alerta se o PDF passar de ~80 KB.

**Variáveis novas:** `CERTILLION_ENV`, `CERTILLION_CLIENT_ID`, `CERTILLION_CLIENT_SECRET`, `CERTILLION_BASE_URL`, `CERTILLION_SESSION_LIFETIME`.

## 8. Segurança e conformidade

- `access_token` de sessão: tabela sem policy de RLS, service role apenas, nunca serializado para o cliente, revogável no painel.
- CPF do token conferido contra o cadastro antes de vincular.
- Consentimento explícito registrado em `certillion_consent_at`: sessão longa significa que o servidor assina sem toque dela por documento, e isso precisa estar aceito de forma inequívoca.
- Auditoria por assinatura em `certillion_signatures` — qual sessão, quando, qual transação. É o que sustenta a assinatura se alguém contestar.

## 9. Testes

**Unitários** (fetch mockado, seguindo `certisignClient.test.ts`):

- PKCE S256 contra vetor conhecido
- montagem da URL de authorize
- mapeamento `client_id`→`manager_id` e `client_secret`→`manager_secret` no `/token`
- CPF divergente no callback → recusa
- sessão ausente → `falha` acionável, sem chamar a API
- `status.code` ≠ 140 → `falha` e **não** baixa o documento
- falha no download → não repete o `/signature`
- reconciliação resolve o provider pela linha, não pelo ambiente

**Verificação automática:** depois do download, `POST /oauth/signature/validate` com `pki_name: ICP_BR` confirma cadeia, CRL e OCSP sem intervenção humana. Roda no teste de integração e serve de rede permanente contra regressão silenciosa. Confirmar antes se essa chamada é cobrada.

**Manual, inegociável antes de produção:** autorizar no celular da dentista, emitir um atestado real, baixar o PDF e **validar em validar.iti.gov.br**. O `signature/validate` é o validador do próprio fornecedor; o do ITI é a autoridade independente. Sem esse passo não está pronto — não existe sandbox e toda assinatura de teste já é real.

## 10. Fora do escopo desta entrega

Receitas, evoluções de tratamento e anamnese (reusam o mesmo provider depois); escolha de PSC pela dentista na interface (o campo já existe, fixo em `REMOTEID`); Certillion Agent; assinatura em lote; fila com link por WhatsApp.

## 11. Pré-requisitos operacionais

1. Solicitar credencial de teste em `certillion.com/fale-conosco` (bloqueia todo o resto).
2. Confirmar com a Dra. Ewerjane que o RemoteID está ativo e que ela consegue autorizar pelo app.
3. Confirmar na Vercel qual é o `SIGNATURE_PROVIDER` em produção antes de mexer na resolução por clínica.

## 12. Riscos abertos

- **Duração real da sessão** definida pelo RemoteID pode ser menor que as 12h pedidas; só medindo em campo. Se for curta demais, a decisão "sem fila" pode precisar ser revista.
- **Credencial de teste expira em 90 dias** sem aviso; o guardrail de ambiente existe para isso não virar quebra silenciosa.
- **Rate limit por CPF** (~80 chamadas/min, variável por PSC) — irrelevante no volume atual, relevante se o produto crescer.
- **Custo unitário** só é conhecido na proposta comercial; PAdES é obrigatório para PDF e é a faixa mais cara.

---

## 13. Referência de chamadas — conferida contra a collection oficial

Base: `https://cloud.certillion.com/css/restful/application` (o host `cloud-ws` é **exclusivo** do `CERTILLION_SIGNER`, que não usamos).

| Chamada | Método / corpo | Auth |
|---|---|---|
| `/oauth/client_token` | form-urlencoded: `grant_type=client_credentials`, `client_id`, `client_secret`, `lifetime` (padrão 300s) | — |
| `/oauth/user-discovery` | JSON: `client_id`, `client_secret`, `user_cpf_cnpj:"CPF"`, `val_cpf_cnpj`, `psc` | — |
| `/oauth/find-psc-accounts` | JSON: `client_id`, `client_secret`, `user_cpf_cnpj`, `val_cpf_cnpj` | — |
| `/oauth/authorize` | GET, query: `response_type=code`, `manager_id`, `code_challenge`, `code_challenge_method=S256`, `psc`, `scope`, `state`, `lifetime`, `redirect_uri`, `login_hint` | — |
| `/oauth/token` | form-urlencoded: `grant_type=authorization_code`, `client_id`, `client_secret`, `manager_id`, `manager_secret`, `code`, `code_verifier`, `psc`, `redirect_uri` | — |
| `/oauth/document` | multipart, campo `file` | Bearer (client ou assinatura) |
| `/oauth/signature` | JSON: `signature_standard`, `signature_policy`, `pki_name`, `detached`, `hashes[{id, alias, hash}]` | Bearer **de assinatura** |
| `/oauth/document/{transaction_id}` | GET, devolve bytes | Bearer (client ou assinatura) |
| `/oauth/signature/validate` | JSON: `signature`, `pki_name` | Bearer |
| `/certificate-discovery` | GET, header opcional `certificate_alias` | Bearer de assinatura |

Note que `/certificate-discovery` **não** leva o prefixo `/oauth`.

### Pontos que a collection esclareceu

- **`psc` é obrigatório também no `/token`**, não só no `/authorize`, e tem que ser o mesmo nos dois.
- **`grant_type`** é explícito nas duas chamadas de token — `client_credentials` e `authorization_code`.
- **`redirect_uri` é opcional** e não exige pré-cadastro, mas se for enviado num, tem que ser idêntico no outro. Vamos sempre enviar.
- **`login_hint` aceita o CPF** e é a forma de travar a autorização no titular certo.
- **`state` é texto livre** — no exemplo do fornecedor vem um UUID com sufixo, o que confirma que podemos carregar o vínculo da clínica ali.

### Divergência registrada

A doc oficial lista `client_id`, `client_secret`, `manager_id` e `manager_secret` como **todos obrigatórios** no `/token`. A collection do fornecedor envia **só o par `manager_*`** (mais `psc`). Como enviar os quatro satisfaz as duas leituras e campos extras em form-urlencoded são inofensivos, mandamos os quatro. Se o `/token` responder `invalid_grant`, testar a variante com só o par `manager_*` **antes** de suspeitar do PKCE — é o ponto mais provável de divergência entre doc e servidor.

### Guardado para depois, não construir agora

- **`/oauth/otp_authorize`** dispensa navegador: a pessoa lê um OTP no app e digita no painel — `client_id`, `client_secret`, `username` (CPF), `otp`, `scope`, `lifetime`. Seria uma UX bem mais simples que QR + callback, **mas o OTP é do app Certillion, e a dentista usa o app do RemoteID**. Vale um teste rápido quando a credencial chegar; se funcionar com RemoteID, simplifica bastante o vínculo.
- **Assinatura visível pela própria API** (`visible_signature_options`), com `image_data` para o logo e posicionamento na página. Hoje desenhamos o carimbo com `pdf-lib` antes de enviar, o que continua valendo. Se um dia migrarmos, atenção: os marcadores de texto na collection vêm com cifrão (`$CERT_CN_WO_CPF$`, `$SIGN_DATE$`) e no OpenAPI público aparecem sem. A collection é o artefato que roda.
- **`/certificate-discovery`** devolve dados do certificado vinculado; serve para avisar a dentista antes de o certificado dela vencer.
