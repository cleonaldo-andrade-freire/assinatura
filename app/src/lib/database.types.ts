// Tipos escritos à mão, espelhando supabase/schema.sql. Se o schema mudar, atualize aqui também
// (ou gere automaticamente depois com `supabase gen types typescript`, quando o CLI estiver configurado).

/** Antes era união fechada de 6 valores; agora os planos são dado editável (tabela `plans`) — só o `id`/slug fica fixo aqui. */
export type Plan = string;
export type BillingCycle = "monthly" | "yearly";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";
export type UserRole = "owner" | "staff";

export interface Clinic {
  id: string;
  name: string;
  slug: string;
  api_key: string;
  plan: Plan;
  pending_plan: Plan | null;
  custom_monthly_price: number | null;
  billing_cycle: BillingCycle;
  asaas_customer_id: string | null;
  asaas_subscription_id: string | null;
  subscription_status: SubscriptionStatus;
  trial_ends_at: string | null;
  past_due_since: string | null;
  whatsapp_number: string | null;
  evolution_base_url: string | null;
  evolution_instance_name: string | null;
  evolution_api_key: string | null;
  notify_phone: string | null;
  logo_url: string | null;
  dentist_name: string | null;
  dentist_cro: string | null;
  dentist_cro_uf: string | null;
  dentist_cpf: string | null;
  dentist_phone: string | null;
  dentist_email: string | null;
  clinic_address: string | null;
  psc_access_token?: string | null;
  psc_refresh_token?: string | null;
  psc_certificate_alias?: string | null;
  psc_certificate_pem?: string | null;
  /** Texto do Termo de Adesão ao Meio Eletrônico, configurável pela própria
   * clínica em Configurações (nasce vazio — enquanto vazio, solicitar
   * assinatura de evolução fica bloqueado, ver lib/electronicConsent.ts).
   * Nunca hardcoded no código: cada clínica cola a versão revisada pelo
   * próprio advogado. */
  consent_term_text: string | null;
  consent_term_version: string | null;
  consent_term_updated_at: string | null;
  lead_bot_enabled: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  clinic_id: string;
  email: string;
  role: UserRole;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface AnamnesisAnswer {
  question: string;
  answer: string;
}

export interface Anamnesis {
  id: string;
  clinic_id: string;
  token: string;
  patient_name: string;
  patient_cpf: string | null;
  patient_phone: string | null;
  answers: AnamnesisAnswer[];
  created_at: string;
  /** Último reenvio manual do link/PDF assinado por WhatsApp — ver migration 051. */
  sent_whatsapp_at: string | null;
}

export interface Signature {
  id: string;
  anamnesis_id: string;
  clinic_id: string;
  signer_name: string;
  signer_cpf: string;
  signed_at_client: string;
  signed_at_server: string;
  ip: string | null;
  user_agent: string | null;
  sha256: string;
  pdf_storage_key: string;
  created_at: string;
  /** Traçado vetorial (pontos + pressão + tempo) — ver migration 052 e
   * SignatureCanvas.tsx. `null` em assinaturas feitas antes dessa migration. */
  stroke_data: Record<string, unknown> | null;
  // Contra-assinatura ICP-Brasil da dentista sobre a anamnese — ver
  // migration 058. Sempre posterior à assinatura do paciente acima.
  dentist_signature_status: "nao_assinada" | "assinada";
  dentist_signed_at: string | null;
  dentist_pdf_storage_key: string | null;
  dentist_pdf_sha256: string | null;
  dentist_content_snapshot: Record<string, unknown> | null;
  dentist_content_hash: string | null;
}

export type CertificateStatus = "rascunho" | "aguardando_assinatura" | "assinado" | "falha" | "pendente_assinatura";

export interface Certificate {
  id: string;
  clinic_id: string;
  token: string;
  patient_name: string;
  patient_cpf: string | null;
  patient_phone: string | null;
  dentist_name: string;
  dentist_cro: string;
  dentist_cro_uf: string;
  cid: string | null;
  hide_cid_on_patient_pdf: boolean;
  reason: string;
  rest_days: number;
  starts_on: string;
  status: CertificateStatus;
  signature_provider: string | null;
  signature_provider_doc_id: string | null;
  signature_document_key: string | null;
  signature_sign_url: string | null;
  signature_requested_at: string | null;
  signed_at: string | null;
  signature_error: string | null;
  pdf_storage_key: string | null;
  sha256: string | null;
  sent_whatsapp_at: string | null;
  patient_id: string | null;
  validation_code: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  created_by: string | null;
  created_at: string;
  /** Preenchido quando o documento foi emitido pela via não assinada
   * digitalmente (mobile, sem ICP-Brasil) — ver migration 050. */
  unsigned_pdf_at: string | null;
}

export interface Patient {
  id: string;
  clinic_id: string;
  name: string;
  cpf: string | null;
  phone: string | null;
  notes: string | null;
  photo_storage_key: string | null;
  birth_date: string | null;
  rg: string | null;
  occupation: string | null;
  address: string | null;
  created_at: string;
  updated_at: string;
}

export interface CidCode {
  code: string;
  description: string;
}

export interface CertificateTemplate {
  id: string;
  clinic_id: string;
  name: string;
  reason_template: string;
  rest_days_default: number | null;
  created_at: string;
}

export type PrescriptionStatus = "rascunho" | "aguardando_assinatura" | "assinado" | "falha" | "pendente_assinatura";

/**
 * Autodeclarado pelo dentista, não classificado pelo sistema — não temos uma
 * base de referência confiável pra assumir isso automaticamente (ver
 * `lib/prescriptionControl.ts`). "controlado_especial" é bloqueado na emissão,
 * o sistema não suporta numeração/talão de receituário especial.
 */
export type PrescriptionControlType = "comum" | "antimicrobiano_retencao" | "controlado_especial";

export interface PrescriptionItem {
  drug_name: string;
  dosage: string;
  instructions: string;
  generic_allowed: boolean;
  control_type: PrescriptionControlType;
  dispensed_at?: string | null;
  dispensed_by_crf?: string | null;
  dispensed_by_pharmacy_cnpj?: string | null;
}

export interface PrescriptionDispensation {
  id: string;
  prescription_id: string;
  clinic_id: string;
  item_index: number;
  drug_name: string;
  pharmacist_crf: string;
  pharmacy_cnpj: string;
  dispensed_at: string;
}

export interface Prescription {
  id: string;
  clinic_id: string;
  token: string;
  patient_name: string;
  patient_cpf: string | null;
  patient_phone: string | null;
  patient_id: string | null;
  dentist_name: string;
  dentist_cro: string;
  dentist_cro_uf: string;
  items: PrescriptionItem[];
  notes: string | null;
  status: PrescriptionStatus;
  signature_provider: string | null;
  signature_provider_doc_id: string | null;
  signature_document_key: string | null;
  signature_sign_url: string | null;
  signature_requested_at: string | null;
  signed_at: string | null;
  signature_error: string | null;
  pdf_storage_key: string | null;
  sha256: string | null;
  sent_whatsapp_at: string | null;
  validation_code: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  created_by: string | null;
  created_at: string;
  /** Preenchido quando o documento foi emitido pela via não assinada
   * digitalmente (mobile, sem ICP-Brasil) — ver migration 050. */
  unsigned_pdf_at: string | null;
}

export interface PrescriptionTemplate {
  id: string;
  clinic_id: string;
  name: string;
  items: PrescriptionItem[];
  notes_template: string | null;
  created_at: string;
}

export interface Medication {
  id: string;
  name: string;
  presentation: string | null;
  default_dosage: string | null;
}

export type QuestionType = "text" | "yesno";

export interface Question {
  id: string;
  text: string;
  type: QuestionType;
}

export interface QuestionTemplate {
  id: string;
  clinic_id: string;
  name: string;
  questions: Question[];
  created_at: string;
}

export type ConversationStatus = "active" | "completed" | "abandoned";

export interface Conversation {
  id: string;
  clinic_id: string;
  template_id: string;
  patient_name: string;
  patient_phone: string;
  questions: Question[];
  current_index: number;
  answers: AnamnesisAnswer[];
  status: ConversationStatus;
  created_at: string;
  updated_at: string;
}

export interface UsageCharge {
  id: string;
  clinic_id: string;
  anamnesis_id: string;
  asaas_payment_id: string | null;
  amount: number;
  created_at: string;
}

export type AppointmentStatus =
  | "agendado"
  | "confirmado"
  | "em_atendimento"
  | "cancelado_paciente"
  | "cancelado_dentista"
  | "atendido"
  | "faltou";

export interface Appointment {
  id: string;
  clinic_id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: AppointmentStatus;
  urgent: boolean;
  patient_id: string | null;
  patient_name: string;
  patient_phone: string;
  professional_name: string;
  notes: string | null;
  confirm_token: string;
  reminder_24h_sent_at: string | null;
  reminder_final_sent_at: string | null;
  // Data prevista de retorno, marcada na hora do agendamento — não cria uma
  // segunda consulta sozinha, é só um sinal pro dashboard avisar a recepção
  // quando estiver perto. return_notified_at é só informativo ("já mandei
  // lembrete"); quem tira da lista é return_dismissed_at (manual ou
  // automático, quando o paciente é reagendado).
  return_due_date: string | null;
  return_notified_at: string | null;
  return_dismissed_at: string | null;
  // Idem, mas pra lista de "consultas canceladas" do dashboard.
  cancellation_dismissed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type AppointmentEventType = "created" | "status_changed" | "rescheduled";
export type AppointmentEventActor = "recepcao" | "paciente" | "sistema";

export interface AppointmentEvent {
  id: string;
  appointment_id: string;
  clinic_id: string;
  event_type: AppointmentEventType;
  from_status: AppointmentStatus | null;
  to_status: AppointmentStatus | null;
  actor: AppointmentEventActor;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export type AppointmentMessageTemplateType =
  | "solicitacao"
  | "lembrete_24h"
  | "lembrete_final"
  | "confirmado"
  | "cancelado"
  | "remarcado"
  | "retorno_lembrete"
  | "cancelamento_contato";

export interface AppointmentMessageTemplate {
  id: string;
  clinic_id: string;
  template_type: AppointmentMessageTemplateType;
  body: string;
  created_at: string;
  updated_at: string;
}

export type ProsthesisStage = "pre_laboratorio" | "laboratorio" | "agenda" | "realizado";

export interface ProsthesisOrder {
  id: string;
  clinic_id: string;
  patient_id: string | null;
  patient_name: string;
  patient_phone: string;
  description: string;
  expected_delivery_date: string | null;
  stage: ProsthesisStage;
  stage_since: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ProsthesisOrderEventActor = "recepcao" | "sistema";

export interface ProsthesisOrderEvent {
  id: string;
  prosthesis_order_id: string;
  clinic_id: string;
  from_stage: ProsthesisStage | null;
  to_stage: ProsthesisStage;
  actor: ProsthesisOrderEventActor;
  created_at: string;
}

export interface ProsthesisStageTemplate {
  id: string;
  clinic_id: string;
  stage: ProsthesisStage;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface PlanRecord {
  id: string;
  name: string;
  monthly_price: number;
  monthly_limit: number;
  overage_price: number;
  features: string[];
  display_order: number;
  active: boolean;
  featured: boolean;
  created_at: string;
  updated_at: string;
}

/** "Plano" de tratamento/convênio da clínica (ex.: "Particular", "Unimed Odonto") — não confundir com `Plan` (assinatura do SaaS). */
export interface PriceTable {
  id: string;
  clinic_id: string;
  name: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface PriceTableItem {
  id: string;
  clinic_id: string;
  price_table_id: string;
  specialty: string | null;
  name: string;
  price: number;
  active: boolean;
  favorito: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export type BudgetStatus = "em_aberto" | "aprovado";
export type BudgetDiscountType = "fixed" | "percent";

export interface Budget {
  id: string;
  clinic_id: string;
  patient_id: string | null;
  patient_name: string;
  patient_phone: string;
  description: string;
  responsible_name: string;
  budget_date: string;
  status: BudgetStatus;
  discount_type: BudgetDiscountType;
  discount_value: number;
  installments: number;
  payment_method: string | null;
  down_payment_value: number | null;
  down_payment_method: string | null;
  notes: string | null;
  token: string;
  pdf_storage_key: string | null;
  sha256: string | null;
  sent_whatsapp_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BudgetItem {
  id: string;
  clinic_id: string;
  budget_id: string;
  price_table_item_id: string | null;
  price_table_name: string | null;
  treatment_name: string;
  tooth_region: string | null;
  price: number;
  dentist_name: string;
  selected: boolean;
  display_order: number;
  created_at: string;
}

export type TreatmentStatus = "aberto" | "finalizado";

/** Procedimento do paciente — nasce ao aprovar um orçamento (uma linha por item selecionado), mas vive independente dele depois. */
export interface Treatment {
  id: string;
  clinic_id: string;
  patient_id: string;
  budget_id: string | null;
  budget_item_id: string | null;
  price_table_name: string | null;
  treatment_name: string;
  tooth_region: string | null;
  price: number;
  dentist_name: string;
  status: TreatmentStatus;
  finalized_at: string | null;
  evolution_text: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export type DebitStatus = "aberto" | "pago";

/**
 * Conta a receber ligada a um tratamento — tabela separada de `treatments`
 * de propósito: pagamento parcial gera um SEGUNDO débito (não um segundo
 * tratamento clínico). `treatment_id` fica nulo se o tratamento clínico
 * for excluído depois (o registro financeiro sobrevive).
 */
export interface TreatmentDebit {
  id: string;
  clinic_id: string;
  patient_id: string;
  treatment_id: string | null;
  description: string;
  amount: number;
  status: DebitStatus;
  payment_method: string | null;
  paid_at: string | null;
  /** Já gerou um débito-remanescente (pagamento parcial) — bloqueia "Cancelar recebimento". */
  has_split: boolean;
  receipt_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Recibo — agrupa um ou mais débitos já pagos, com PDF gerado sob demanda (mesmo padrão de `Budget`). */
export interface Receipt {
  id: string;
  clinic_id: string;
  patient_id: string;
  patient_name: string;
  patient_phone: string | null;
  total_amount: number;
  declared_ir: boolean;
  token: string;
  pdf_storage_key: string | null;
  sha256: string | null;
  sent_whatsapp_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ExpenseStatus = "pendente" | "pago";
export type ExpenseNature = "fixa" | "variavel";

/** Regra de despesa recorrente — o cron gera uma `Expense` por mês a partir daqui, nunca a despesa em si. */
export interface RecurringExpense {
  id: string;
  clinic_id: string;
  description: string;
  category: string | null;
  nature: ExpenseNature | null;
  amount: number;
  day_of_month: number;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Uma despesa avulsa ou gerada a partir de uma recorrência. */
export interface Expense {
  id: string;
  clinic_id: string;
  recurring_expense_id: string | null;
  description: string;
  category: string | null;
  nature: ExpenseNature | null;
  amount: number;
  due_date: string;
  status: ExpenseStatus;
  payment_method: string | null;
  paid_at: string | null;
  /** Comprovante de pagamento anexado — bucket `expense-receipts`, ver expenseReceiptStorage.ts. */
  receipt_storage_key: string | null;
  receipt_file_name: string | null;
  receipt_content_type: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Um registro de evolução (nota + até 5 imagens) — um tratamento pode ter vários ao longo do tempo. */
/** nao_solicitada → solicitada → assinada | recusada | expirada. Ver migration 052. */
export type EvolutionSignatureStatus = "nao_solicitada" | "solicitada" | "assinada" | "recusada" | "expirada";

export interface TreatmentEvolution {
  id: string;
  clinic_id: string;
  treatment_id: string;
  patient_id: string;
  evolution_date: string;
  text: string;
  image_keys: string[];
  /** Nome original de cada arquivo, na mesma ordem/posição de `image_keys` — a chave no Storage é um token aleatório, não dá pra saber qual foto é qual sem isso. */
  image_names: string[] | null;
  /** Descrição opcional de cada imagem, mesma ordem/posição de `image_keys`. */
  image_descriptions: string[] | null;
  created_at: string;
  // Assinatura eletrônica (módulo de evolução, ver migration 052) — todos
  // opcionais/com default, evoluções criadas antes deste módulo continuam
  // válidas com signature_status = "nao_solicitada".
  signature_token: string | null;
  signature_status: EvolutionSignatureStatus;
  signature_requested_at: string | null;
  signature_token_expires_at: string | null;
  signature_verification_attempts: number;
  signature_blocked_until: string | null;
  signature_refused_at: string | null;
  signature_refused_reason: string | null;
  content_snapshot: Record<string, unknown> | null;
  content_hash: string | null;
  sent_whatsapp_at: string | null;
  // Ver migration 054 — reenvio automático do link expirado (cron 1x/dia).
  signature_followup_count: number;
  // Ver migration 055 — assinatura ICP-Brasil da dentista (documento
  // separado da assinatura de ciência do paciente acima).
  dentist_signature_status: DentistSignatureStatus;
  dentist_signed_at: string | null;
  dentist_pdf_storage_key: string | null;
  dentist_pdf_sha256: string | null;
}

export type DentistSignatureStatus = "nao_assinada" | "assinada";

export interface TreatmentEvolutionSignature {
  id: string;
  treatment_evolution_id: string;
  clinic_id: string;
  signer_name: string;
  signer_cpf: string | null;
  signed_at_client: string;
  signed_at_server: string;
  ip: string | null;
  user_agent: string | null;
  sha256: string;
  pdf_storage_key: string;
  stroke_data: Record<string, unknown> | null;
  verification_code: string;
  created_at: string;
}

export interface ElectronicConsentTerm {
  id: string;
  clinic_id: string;
  patient_id: string;
  term_version: string;
  term_text_hash: string;
  accepted_at: string;
  accept_channel: string;
  phone_e164: string;
  ip: string | null;
  user_agent: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  created_at: string;
}

export interface DocumentSignatureEvent {
  id: number;
  clinic_id: string;
  document_type: "anamnesis" | "treatment_evolution";
  document_id: string;
  sequence: number;
  event_type: string;
  occurred_at: string;
  actor: "system" | "dentist" | "patient";
  actor_id: string | null;
  payload: Record<string, unknown>;
  ip: string | null;
  user_agent: string | null;
  previous_hash: string | null;
  event_hash: string;
}

/** Imagem solta na galeria do paciente (aba Imagens) — sem vínculo com tratamento/evolução. */
export interface PatientImage {
  id: string;
  clinic_id: string;
  patient_id: string;
  file_name: string;
  storage_key: string;
  content_type: string;
  size_bytes: number;
  description: string | null;
  created_at: string;
}

export type LeadStatus = "bot_active" | "urgent" | "waiting_reply" | "scheduled";

export interface Lead {
  id: string;
  clinic_id: string;
  patient_phone: string;
  patient_name: string | null;
  status: LeadStatus;
  clinical_summary: string | null;
  created_at: string;
  updated_at: string;
}

export type LeadMessageRole = "patient" | "bot" | "staff";

export interface LeadMessage {
  id: string;
  lead_id: string;
  clinic_id: string;
  role: LeadMessageRole;
  content: string;
  created_at: string;
}
