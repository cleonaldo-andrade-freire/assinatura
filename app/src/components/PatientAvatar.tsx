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
}: {
  clinicId: string;
  patientId: string | null;
  name: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  if (!patientId || failed) {
    return (
      <span
        aria-hidden
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: "var(--surface-sunken)",
          color: "var(--ink-faint)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: Math.round(size * 0.42),
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {initial}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/clinics/${clinicId}/patients/${patientId}/photo`}
      alt=""
      onError={() => setFailed(true)}
      style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
    />
  );
}
