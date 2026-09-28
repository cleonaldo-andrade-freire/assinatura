"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { formatLocationAddress, locationMapsUrl } from "@/lib/locations";
import type { ClinicLocation } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN",
  "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];

interface FormState {
  name: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  maps_url: string;
  is_default: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  cep: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  maps_url: "",
  is_default: false,
};

function maskCep(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

function toForm(l: ClinicLocation): FormState {
  return {
    name: l.name,
    cep: l.cep ? maskCep(l.cep) : "",
    street: l.street,
    number: l.number ?? "",
    complement: l.complement ?? "",
    neighborhood: l.neighborhood ?? "",
    city: l.city,
    state: l.state,
    maps_url: l.maps_url ?? "",
    is_default: l.is_default,
  };
}

/** Cadastro de locais de atendimento — lista + formulário (novo/editar) na mesma tela. */
export function LocationsManager({ clinicId, initialLocations }: { clinicId: string; initialLocations: ClinicLocation[] }) {
  const router = useRouter();
  const [locations, setLocations] = useState(initialLocations);
  // null = formulário fechado; "new" = cadastrando; id = editando esse local
  const [editing, setEditing] = useState<string | null>(initialLocations.length === 0 ? "new" : null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [fetchingCep, setFetchingCep] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<ClinicLocation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function reload() {
    const res = await fetch(`/api/clinics/${clinicId}/locations`);
    if (res.ok) setLocations((await res.json()).locations ?? []);
    router.refresh();
  }

  function openNew() {
    setForm(EMPTY_FORM);
    setError(null);
    setEditing("new");
  }

  function openEdit(l: ClinicLocation) {
    setForm(toForm(l));
    setError(null);
    setEditing(l.id);
  }

  async function handleCep(value: string) {
    const masked = maskCep(value);
    set("cep", masked);
    const raw = masked.replace(/\D/g, "");
    if (raw.length !== 8) return;
    setFetchingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${raw}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm((f) => ({
          ...f,
          street: data.logradouro || f.street,
          neighborhood: data.bairro || f.neighborhood,
          city: data.localidade || f.city,
          state: data.uf || f.state,
        }));
      }
    } catch {
      // CEP é conveniência — se o ViaCEP falhar, preenche à mão
    } finally {
      setFetchingCep(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const isNew = editing === "new";
      const res = await fetch(isNew ? `/api/clinics/${clinicId}/locations` : `/api/clinics/${clinicId}/locations/${editing}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, cep: form.cep.replace(/\D/g, "") }),
      });
      const data = await res.json();
      if (!res.ok) {
        const fieldErrors = data.details?.fieldErrors as Record<string, string[]> | undefined;
        const first = fieldErrors && Object.values(fieldErrors)[0]?.[0];
        setError(data.message || first || "Confira os campos obrigatórios.");
        return;
      }
      setEditing(null);
      push(isNew ? "Local cadastrado." : "Local atualizado.", "success");
      await reload();
    } finally {
      setSaving(false);
    }
  }

  async function patch(l: ClinicLocation, body: { active?: boolean; is_default?: boolean }, okMessage: string) {
    const res = await fetch(`/api/clinics/${clinicId}/locations/${l.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      push(data.message || data.error || "Falha ao atualizar o local.");
      return;
    }
    push(okMessage, "success");
    await reload();
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/locations/${toDelete.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        push(data.message || data.error || "Falha ao excluir o local.");
        return;
      }
      push(
        data.deactivated
          ? `"${toDelete.name}" tem ${data.appointments} consulta(s) vinculada(s) — foi desativado em vez de excluído.`
          : "Local excluído.",
        "success"
      );
      if (editing === toDelete.id) setEditing(null);
      setToDelete(null);
      await reload();
    } finally {
      setDeleting(false);
    }
  }

  const formPanel = editing && (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <p className={styles.panelHeaderTitle}>{editing === "new" ? "Novo local" : "Editar local"}</p>
      </div>
      <div className={styles.panelBody}>
        {error && <div className="error-box">{error}</div>}
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="locName" className={styles.label}>
              Nome do local
            </label>
            <input
              id="locName"
              className={styles.input}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Ex.: Consultório Centro, Clínica Sorriso — Lagarto"
              required
            />
            <p className={styles.hint}>É como o paciente vê o local na mensagem.</p>
          </div>

          <div className={styles.formRow}>
            <div className={styles.field}>
              <label htmlFor="locCep" className={styles.label}>
                CEP {fetchingCep && <span style={{ fontWeight: 400, color: "var(--ink-faint)" }}>— buscando…</span>}
              </label>
              <input
                id="locCep"
                className={styles.input}
                inputMode="numeric"
                value={form.cep}
                onChange={(e) => handleCep(e.target.value)}
                placeholder="00000-000"
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="locNeighborhood" className={styles.label}>
                Bairro
              </label>
              <input id="locNeighborhood" className={styles.input} value={form.neighborhood} onChange={(e) => set("neighborhood", e.target.value)} />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="locStreet" className={styles.label}>
              Rua / Avenida
            </label>
            <input id="locStreet" className={styles.input} value={form.street} onChange={(e) => set("street", e.target.value)} required />
          </div>

          <div className={styles.formRow}>
            <div className={styles.field}>
              <label htmlFor="locNumber" className={styles.label}>
                Número
              </label>
              <input id="locNumber" className={styles.input} value={form.number} onChange={(e) => set("number", e.target.value)} />
            </div>
            <div className={styles.field}>
              <label htmlFor="locComplement" className={styles.label}>
                Complemento
              </label>
              <input
                id="locComplement"
                className={styles.input}
                value={form.complement}
                onChange={(e) => set("complement", e.target.value)}
                placeholder="Sala, andar, edifício…"
              />
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.field}>
              <label htmlFor="locCity" className={styles.label}>
                Cidade
              </label>
              <input id="locCity" className={styles.input} value={form.city} onChange={(e) => set("city", e.target.value)} required />
            </div>
            <div className={styles.field}>
              <label htmlFor="locState" className={styles.label}>
                UF
              </label>
              <select id="locState" className={styles.select} value={form.state} onChange={(e) => set("state", e.target.value)} required>
                <option value="">Selecione…</option>
                {UFS.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="locMaps" className={styles.label}>
              Link de como chegar (opcional)
            </label>
            <input
              id="locMaps"
              className={styles.input}
              type="url"
              value={form.maps_url}
              onChange={(e) => set("maps_url", e.target.value)}
              placeholder="https://maps.app.goo.gl/…"
            />
            <p className={styles.hint}>
              Se ficar vazio, o link do Google Maps é gerado a partir do endereço. Cole um link próprio (Google Maps →
              Compartilhar → Copiar link) quando o endereço sozinho não levar ao ponto exato — ex.: entrada pelos fundos,
              galeria, shopping.
            </p>
            {form.street && form.city && form.state && (
              <a
                href={locationMapsUrl({ ...form, cep: form.cep.replace(/\D/g, "") })}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 12.5 }}
              >
                Testar link no mapa ↗
              </a>
            )}
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) => set("is_default", e.target.checked)}
              style={{ width: 18, height: 18, accentColor: "var(--brand)" }}
            />
            <span style={{ fontSize: 13.5 }}>Local padrão — já vem selecionado ao agendar e ao enviar anamnese</span>
          </label>

          <div className={styles.formActions} style={{ display: "flex", gap: 10 }}>
            {locations.length > 0 && (
              <button type="button" className={`${styles.btn} ${styles.btnGhost}`} disabled={saving} onClick={() => setEditing(null)}>
                Cancelar
              </button>
            )}
            <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={saving}>
              {saving ? "Salvando…" : "Salvar local"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {formPanel}

      <div className={styles.panel}>
        <div className={styles.panelHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p className={styles.panelHeaderTitle}>Locais cadastrados</p>
          {editing !== "new" && (
            <button type="button" className={`${styles.btn} ${styles.btnGhost}`} style={{ fontSize: 13 }} onClick={openNew}>
              + Novo local
            </button>
          )}
        </div>
        {locations.length === 0 ? (
          <div className={styles.emptyState}>
            Nenhum local cadastrado. Enquanto não houver, as mensagens usam o endereço da clínica (Configurações → Dados da
            clínica).
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Local</th>
                <th>Endereço</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {locations.map((l) => (
                <tr key={l.id} style={l.active ? undefined : { opacity: 0.55 }}>
                  <td className={styles.rowTitle}>
                    <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      {l.name}
                      {l.is_default && <span className={`${styles.statusDot} ${styles.statusOk}`}>Padrão</span>}
                      {!l.active && <span className={styles.statusDot}>Desativado</span>}
                    </span>
                  </td>
                  <td data-label="Endereço">
                    <div>{formatLocationAddress(l)}</div>
                    <a href={locationMapsUrl(l)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5 }}>
                      Ver no mapa ↗
                    </a>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <ActionMenu
                      items={[
                        { label: "Editar", onClick: () => openEdit(l) },
                        ...(l.active && !l.is_default
                          ? [{ label: "Tornar padrão", onClick: () => patch(l, { is_default: true }, `"${l.name}" agora é o local padrão.`) }]
                          : []),
                        l.active
                          ? { label: "Desativar", onClick: () => patch(l, { active: false }, "Local desativado.") }
                          : { label: "Reativar", onClick: () => patch(l, { active: true }, "Local reativado.") },
                        { label: "Excluir", danger: true, onClick: () => setToDelete(l) },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmDialog
        open={!!toDelete}
        title="Excluir local?"
        message={
          toDelete
            ? `"${toDelete.name}" será excluído. Se houver consultas marcadas nele, o local é só desativado, pra essas consultas continuarem com o endereço.`
            : ""
        }
        confirmLabel="Excluir"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
