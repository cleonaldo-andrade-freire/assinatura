import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidToken } from "@/lib/validation";
import { readReceiptPdf } from "@/lib/receiptPdfStorage";

/** Download público do PDF de recibo, acessado pelo paciente via /recibo?token=... */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  if (!isValidToken(params.token)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: receipt } = await supabase.from("receipts").select("id, pdf_storage_key").eq("token", params.token).maybeSingle();

  if (!receipt || !receipt.pdf_storage_key) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const pdf = await readReceiptPdf(receipt.pdf_storage_key);
  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="recibo-${receipt.id}.pdf"`,
    },
  });
}
