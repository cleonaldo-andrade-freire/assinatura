"use client";

import { useEffect, useState } from "react";
import { formatLocationAddress } from "@/lib/locations";
import type { ClinicLocation } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

/**
 * Locais ATIVOS da clínica, buscados no próprio cliente — os formulários que
 * usam isso (agendamento, envio de anamnese) abrem de vários lugares
 * diferentes (modais, página cheia, ficha do paciente), e buscar aqui evita
 * ter que passar a lista por props em todos esses caminhos.
 */
export function useClinicLocations(clinicId: string) {
  const [locations, setLocations] = useState<ClinicLocation[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/clinics/${clinicId}/locations?active=1`)
      .then((res) => (res.ok ? res.json() : { locations: [] }))
      .then((data) => {
        if (!cancelled) setLocations(data.locations ?? []);
      })
      .catch(() => {
        if (!cancelled) setLocations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [clinicId]);
  return locations;
}

/** Id do local padrão (ou o primeiro, se nenhum estiver marcado) — `""` quando a clínica não tem locais. */
export function defaultLocationId(locations: ClinicLocation[]): string {
  return (locations.find((l) => l.is_default) ?? locations[0])?.id ?? "";
}

/**
 * Seletor de local de atendimento. Não renderiza nada se a clínica não tem
 * locais cadastrados — pra quem atende num endereço só, o formulário fica
 * exatamente como era.
 */
export function LocationSelect({
  locations,
  value,
  onChange,
  allowNone,
  hint,
}: {
  locations: ClinicLocation[] | null;
  value: string;
  onChange: (id: string) => void;
  /** Mostra a opção "Não informar" (ex.: anamnese, onde o local é só um complemento da mensagem). */
  allowNone?: boolean;
  hint?: string;
}) {
  if (!locations || locations.length === 0) return null;
  const selected = locations.find((l) => l.id === value);
  return (
    <div className={styles.field}>
      <label htmlFor="locationId" className={styles.label}>
        Local de atendimento
      </label>
      <select id="locationId" className={styles.select} value={value} onChange={(e) => onChange(e.target.value)}>
        {allowNone && <option value="">Não informar</option>}
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      {selected ? (
        <p className={styles.hint}>{formatLocationAddress(selected)}</p>
      ) : (
        hint && <p className={styles.hint}>{hint}</p>
      )}
    </div>
  );
}
