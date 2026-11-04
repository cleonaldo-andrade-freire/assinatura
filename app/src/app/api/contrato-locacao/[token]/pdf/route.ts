import { NextRequest, NextResponse } from "next/server";
import { isValidToken } from "@/lib/validation";
import { getContractByToken } from "@/lib/roomRentalContractServer";
import { buildRentalContractPdf } from "@/lib/roomRentalContractPdf";

/** PDF do contrato de locação assinado — o token do link é a credencial. */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  if (!isValidToken(params.token)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const contract = await getContractByToken(params.token);
  if (!contract || !contract.signedAt) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const pdf = await buildRentalContractPdf(contract.snapshot, {
    signedAt: contract.signedAt,
    dataUrl: contract.signatureDataUrl,
    ip: contract.signatureIp,
    contentHash: contract.contentHash,
  });

  const name = `contrato-locacao-${contract.snapshot.rental.date}.pdf`;
  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
