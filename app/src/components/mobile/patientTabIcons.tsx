import type { PatientTabKey } from "@/lib/patientTabs";

function AgendamentosIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function OrcamentosIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 3h9l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 13h5M8 16.5h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function TratamentosIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 3c-2 0-3.5 1.7-3.5 4 0 3 1.3 4.2 1.3 7.5 0 2.5 0.9 4.5 2.2 4.5 1.4 0 1.4-3.3 2-6 0.6 2.7 0.6 6 2 6 1.3 0 2.2-2 2.2-4.5 0-3.3 1.3-4.5 1.3-7.5 0-2.3-1.5-4-3.5-4-1 0-1.7 0.6-2 1.3C9.7 3.6 9 3 8 3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DebitosIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="16.5" cy="14.5" r="1.4" fill="currentColor" />
    </svg>
  );
}

function ImagensIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="9" cy="10" r="1.8" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4 17l5-5 3.5 3.5L16 12l4.5 5.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AnamnesesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 3h8a2 2 0 012 2v14a2 2 0 01-2 2H8a2 2 0 01-2-2V5a2 2 0 012-2zM9 8h6M9 12h6M9 16h3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AtestadosIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 3h9l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.5 15.5l1.6 1.6L14.5 13.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PrescricoesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6.5 17.5l6-6a3 3 0 114.24 4.24l-6 6a3 3 0 01-4.24-4.24z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M11 8.5L15.5 13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 20h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function DadosPessoaisIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

/** Ícone por aba da ficha do paciente — usado só no shell mobile v2
 * (PatientTabs.tsx troca o rótulo em texto por isso, ver useMobileV2Active).
 * 8 abas em texto não cabem numa tela de celular sem cortar; em ícone,
 * cabem todas sem precisar de scroll horizontal. */
export const PATIENT_TAB_ICONS: Record<PatientTabKey, () => JSX.Element> = {
  dados_pessoais: DadosPessoaisIcon,
  agendamentos: AgendamentosIcon,
  orcamentos: OrcamentosIcon,
  tratamentos: TratamentosIcon,
  debitos: DebitosIcon,
  imagens: ImagensIcon,
  anamneses: AnamnesesIcon,
  atestados: AtestadosIcon,
  prescricoes: PrescricoesIcon,
};
