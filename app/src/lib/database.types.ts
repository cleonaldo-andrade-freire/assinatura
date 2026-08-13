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
  dentist_phone: string | null;
  dentist_email: string | null;
  clinic_address: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  clinic_id: string;
  email: string;
  role: UserRole;
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
}

export type CertificateStatus = "rascunho" | "aguardando_assinatura" | "assinado" | "falha";

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
}

export interface Patient {
  id: string;
  clinic_id: string;
  name: string;
  cpf: string | null;
  phone: string | null;
  notes: string | null;
  photo_storage_key: string | null;
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

export type PrescriptionStatus = "rascunho" | "aguardando_assinatura" | "assinado" | "falha";

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
