import Link from "next/link";
import { headers } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { lookupPrescriptionForDispensing } from "@/lib/pharmacyDispensing";
import { checkRateLimit } from "@/lib/rateLimit";
import { DispensingForm } from "@/components/DispensingForm";

export default async function FarmaciaCodePage({ params }: { params: { code: string } }) {
  const supabase = createSupabaseAdminClient();
  const ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const allowed = await checkRateLimit(supabase, `farmacia-view:${ip}`, { windowSeconds: 300, maxAttempts: 20 });

  return (
    <div className="wrap">
      <header style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <span style={{ fontFamily: "Georgia, serif", fontWeight: 600, fontSize: 17, color: "var(--brand-deep)" }}>
          Área da farmácia
        </span>
      </header>

      {!allowed ? (
        <div className="card" style={{ textAlign: "center" }}>
          <h1>Muitas tentativas</h1>
          <p style={{ color: "var(--ink-soft)" }}>
            Você tentou acessar códigos demais em pouco tempo. Espera alguns minutos e tenta de novo.
          </p>
        </div>
      ) : (
        <FarmaciaResult code={params.code} supabase={supabase} />
      )}

      <div className="card" style={{ textAlign: "center", marginTop: 16 }}>
        <Link href="/farmacia" style={{ fontSize: 13.5 }}>
          ← Verificar outro código
        </Link>
      </div>
    </div>
  );
}

async function FarmaciaResult({
  code,
  supabase,
}: {
  code: string;
  supabase: ReturnType<typeof createSupabaseAdminClient>;
}) {
  const lookup = await lookupPrescriptionForDispensing(supabase, code);

  if (!lookup.found) {
    return (
      <div className="card" style={{ textAlign: "center" }}>
        <h1>{lookup.reason === "revoked" ? "Prescrição revogada" : "Código não encontrado"}</h1>
        <p style={{ color: "var(--ink-soft)" }}>
          {lookup.reason === "revoked"
            ? "Esta prescrição foi revogada pela clínica e não pode mais ser dispensada."
            : "Confira se digitou o código certo. Ele fica impresso no rodapé da prescrição, junto do QR code."}
        </p>
      </div>
    );
  }

  return <DispensingForm code={code} prescription={lookup.prescription} clinicName={lookup.clinicName} />;
}
