import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readReceiptPdf } from "@/lib/receiptPdfStorage";

/** Download autenticado do PDF de recibo, usado no dashboard. */
export async function GET(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: receipt } = await supabase.from("receipts").select("id, pdf_storage_key").eq("id", params.id).maybeSingle();
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
