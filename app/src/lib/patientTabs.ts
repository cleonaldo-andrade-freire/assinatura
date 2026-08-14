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
  { key: "agendamentos", label: "Agendamentos" },
  { key: "orcamentos", label: "Orçamentos" },
  { key: "tratamentos", label: "Tratamentos" },
  { key: "imagens", label: "Imagens" },
  { key: "anamneses", label: "Anamneses" },
  { key: "atestados", label: "Atestados" },
  { key: "prescricoes", label: "Prescrições" },
] as const;

export type PatientTabKey = (typeof PATIENT_TABS)[number]["key"];
