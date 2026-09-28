"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { formatLocationAddress, locationMapsUrl } from "@/lib/locations";
import type { ClinicLocation } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

/**
 * Linha "Local" do detalhe de agendamento. Busca TODOS os locais (não só os
 * ativos) porque a consulta pode estar num local já desativado — ele precisa
 * continuar aparecendo com o endereço, só não é oferecido pra troca. Some
 * por completo se a clínica não tem locais cadastrados.
 *
 * Trocar o local não avisa o paciente sozinho — ver PATCH de appointments/[id].
 */
export function AppointmentLocationField({
  clinicId,
  appointmentId,
  locationId,
  onChanged,
}: {
  clinicId: string;
  appointmentId: string;
  locationId: string | null;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [locations, setLocations] = useState<ClinicLocation[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/clinics/${clinicId}/locations`)
      .then((res) => (res.ok ? res.json() : { locations: [] }))
      .then((data) => !cancelled && setLocations(data.locations ?? []))
      .catch(() => !cancelled && setLocations([]));
    return () => {
      cancelled = true;
    };
  }, [clinicId]);

  if (!locations || locations.length === 0) return null;
  const current = locations.find((l) => l.id === locationId) ?? null;
  const options = locations.filter((l) => l.active);

  async function save(newId: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/appointments/${appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location_id: newId || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        push(data.message || data.error || "Falha ao trocar o local.");
        return;
      }
      setEditing(false);
      push("Local atualizado. Reenvie a confirmação se quiser avisar o paciente.", "success");
      router.refresh();
      onChanged?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: "12px 0 4px", borderTop: "1px solid var(--line)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <span style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>Local</span>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            style={{ border: "none", background: "none", color: "var(--brand)", cursor: "pointer", fontSize: 12.5, fontWeight: 600, padding: 0 }}
          >
            {current ? "Trocar" : "+ Definir"}
          </button>
        )}
      </div>

      {editing ? (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <select
            className={styles.select}
            defaultValue={current?.active ? current.id : ""}
            disabled={saving}
            onChange={(e) => save(e.target.value)}
            autoFocus
          >
            <option value="">Sem local</option>
            {options.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <button type="button" disabled={saving} onClick={() => setEditing(false)} className={`${styles.btn} ${styles.btnGhost}`}>
            Cancelar
          </button>
        </div>
      ) : (
        current && (
          <div style={{ marginTop: 6, fontSize: 13.5, lineHeight: 1.5 }}>
            <div style={{ fontWeight: 600 }}>
              {current.name}
              {!current.active && <span style={{ color: "var(--ink-faint)", fontWeight: 400 }}> (desativado)</span>}
            </div>
            <div style={{ color: "var(--ink-soft)" }}>{formatLocationAddress(current)}</div>
            <a href={locationMapsUrl(current)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5 }}>
              Abrir no mapa ↗
            </a>
          </div>
        )
      )}

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
