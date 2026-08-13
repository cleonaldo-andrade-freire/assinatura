import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidToken } from "@/lib/validation";
import { readBudgetPdf } from "@/lib/budgetPdfStorage";

/** Download público do PDF de orçamento, acessado pelo paciente via /orcamento?token=... */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  if (!isValidToken(params.token)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: budget } = await supabase
    .from("budgets")
    .select("id, pdf_storage_key")
    .eq("token", params.token)
    .maybeSingle();

  if (!budget || !budget.pdf_storage_key) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const pdf = await readBudgetPdf(budget.pdf_storage_key);
  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="orcamento-${budget.id}.pdf"`,
    },
  });
}
