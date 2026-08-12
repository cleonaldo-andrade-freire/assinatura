import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { lookupPrescriptionForDispensing, dispensePrescriptionItem } from "@/lib/pharmacyDispensing";
import { isValidCNPJ, formatCNPJ } from "@/lib/validation";
import { sendText } from "@/lib/evolution";
import type { Clinic } from "@/lib/database.types";

const bodySchema = z.object({
  itemIndex: z.number().int().min(0),
  crf: z.string().min(1),
  cnpj: z.string().refine(isValidCNPJ, { message: "CNPJ inválido" }),
});

/** Dá baixa num item da prescrição — acesso é pelo código curto (sem sessão), mesmo modelo do portal de validação. */
export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const supabase = createSupabaseAdminClient();

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const allowed = await checkRateLimit(supabase, `farmacia:${ip}`, { windowSeconds: 300, maxAttempts: 10 });
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }

  const lookup = await lookupPrescriptionForDispensing(supabase, params.code);
  if (!lookup.found) {
    return NextResponse.json({ error: lookup.reason }, { status: lookup.reason === "revoked" ? 409 : 404 });
  }

  const result = await dispensePrescriptionItem(
    supabase,
    lookup.prescription.id,
    parsed.data.itemIndex,
    parsed.data.crf.trim(),
    parsed.data.cnpj.replace(/\D/g, "")
  );
  if (!result.ok) {
    const status = result.error === "already_dispensed" ? 409 : result.error === "unknown" ? 500 : 404;
    return NextResponse.json({ error: result.error }, { status });
  }

  const drugName = result.items[parsed.data.itemIndex]?.drug_name ?? "medicamento";

  const { data: clinic } = await supabase.from("clinics").select("*").eq("id", lookup.prescription.clinic_id).maybeSingle();
  if (clinic && (clinic as Clinic).notify_phone) {
    await sendText(
      clinic as Clinic,
      (clinic as Clinic).notify_phone!,
      `💊 Prescrição de ${lookup.prescription.patient_name} — "${drugName}" foi dispensado na farmácia CNPJ ${formatCNPJ(parsed.data.cnpj)} (CRF ${parsed.data.crf.trim()}).`
    );
  }

  return NextResponse.json({ items: result.items });
}
