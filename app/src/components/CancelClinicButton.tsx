"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/admin/admin.module.css";

export function CancelClinicButton({ clinicId, disabled }: { clinicId: string; disabled?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleCancel() {
    if (!confirm("Cancelar a assinatura dessa clínica? O acesso dela é bloqueado imediatamente.")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/clinics/${clinicId}/cancel`, { method: "POST" });
      if (!res.ok) {
        alert("Falha ao cancelar. Tenta de novo.");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button type="button" onClick={handleCancel} disabled={disabled || loading} className={`${styles.btn} ${styles.btnDanger}`}>
      {loading ? "Cancelando…" : "Cancelar assinatura"}
    </button>
  );
}
