"use client";

import { useState } from "react";

/** Foto do paciente (ou inicial do nome, se não tiver foto/não estiver vinculado
 * a um cadastro) — mesmo tratamento visual do dropdown de busca do formulário
 * de agendamento. Sem saber de antemão se existe foto, tenta carregar e cai
 * pro fallback via onError (a rota responde 404 rápido quando não há foto). */
export function PatientAvatar({
  clinicId,
  patientId,
  name,
  size = 36,
  radius = "50%",
  tone = "neutral",
  label,
}: {
  clinicId: string;
  patientId: string | null;
  name: string;
  size?: number;
  /** Formato do avatar — "50%" (círculo, padrão) ou um valor em px pra quadrado arredondado. */
  radius?: string;
  /** "brand" reproduz o mesmo tom usado nas linhas de tabela (fundo --brand-tint). */
  tone?: "neutral" | "brand";
  /** Sobrescreve o fallback de 1 letra — ex. iniciais de 2 letras nas listas em grid. */
  label?: string;
}) {
  const [failed, setFailed] = useState(false);
  const fallbackLabel = label ?? name.trim().charAt(0).toUpperCase() ?? "?";
  const background = tone === "brand" ? "var(--brand-tint)" : "var(--surface-sunken)";
  const color = tone === "brand" ? "var(--brand-deep)" : "var(--ink-faint)";

  if (!patientId || failed) {
    return (
      <span
        aria-hidden
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          background,
          color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: Math.round(size * 0.42),
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {fallbackLabel}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/clinics/${clinicId}/patients/${patientId}/photo`}
      alt=""
      onError={() => setFailed(true)}
      style={{ width: size, height: size, borderRadius: radius, objectFit: "cover", flexShrink: 0 }}
    />
  );
}
