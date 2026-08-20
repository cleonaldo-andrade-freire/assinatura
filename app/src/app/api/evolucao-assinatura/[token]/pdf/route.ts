import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidToken } from "@/lib/validation";
import { readEvolutionSignaturePdf } from "@/lib/evolutionSignature";

/** Download público do PDF da evolução assinada — mesmo padrão de
 * /api/anamnesis/[token]/pdf, mas a origem é `treatment_evolutions` +
 * `treatment_evolution_signatures`. */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  if (!isValidToken(params.token)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: evolution } = await supabase
    .from("treatment_evolutions")
    .select("id")
    .eq("signature_token", params.token)
    .maybeSingle();
  if (!evolution) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: signature } = await supabase
    .from("treatment_evolution_signatures")
    .select("id, pdf_storage_key")
    .eq("treatment_evolution_id", evolution.id)
    .maybeSingle();
  if (!signature) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const pdf = await readEvolutionSignaturePdf(signature.pdf_storage_key);
  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="evolucao-${signature.id}.pdf"`,
    },
  });
}
