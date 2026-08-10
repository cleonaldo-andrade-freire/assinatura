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

export interface PlanRecord {
  id: string;
  name: string;
  monthly_price: number;
  monthly_limit: number;
  features: string[];
  display_order: number;
  active: boolean;
  featured: boolean;
  created_at: string;
  updated_at: string;
}
