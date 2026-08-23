/**
 * Config das abas da ficha do paciente — em módulo à parte, sem "use client",
 * de propósito: `pacientes/[id]/page.tsx` (Server Component) precisa ler
 * `PATIENT_TABS` pra validar o `?tab=` da URL. Quando isso vinha exportado
 * de `PatientTabs.tsx` (que tem "use client"), o import virava uma
 * referência de cliente opaca do lado do servidor — chamar `.some()` nela
 * quebrava com "Attempted to call some() from the server but some is on
 * the client". Dado puro fica bem longe da diretiva de cliente.
 */
export const PATIENT_TABS = [
  { key: "dados_pessoais", label: "Dados Pessoais" },
  { key: "termo", label: "Termo" },
  { key: "agendamentos", label: "Agendamentos" },
  { key: "orcamentos", label: "Orçamentos" },
  { key: "tratamentos", label: "Tratamentos" },
  { key: "debitos", label: "Débitos" },
  { key: "imagens", label: "Imagens" },
  { key: "anamneses", label: "Anamneses" },
  { key: "atestados", label: "Atestados" },
  { key: "prescricoes", label: "Receituários" },
] as const;

export type PatientTabKey = (typeof PATIENT_TABS)[number]["key"];

// Abas que a atendente (staff) pode ver na ficha do paciente — mesmo
// critério do menu lateral (ClinicShell): dados clínicos/documentos ficam
// só com o owner, o operacional (agenda, tratamentos, débitos, imagens)
// continua liberado.
export const STAFF_ALLOWED_TAB_KEYS = new Set<PatientTabKey>(["dados_pessoais", "agendamentos", "tratamentos", "debitos"]);
