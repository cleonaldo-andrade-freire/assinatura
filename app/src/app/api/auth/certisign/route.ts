import { NextRequest, NextResponse } from "next/server";
import { PscClient } from "@/lib/psc/PscClient";

export async function GET(req: NextRequest) {
  const pscClient = new PscClient({
    baseUrl: process.env.PSC_BASE_URL || "https://homologacao.vaultid.com.br",
    clientId: process.env.PSC_CLIENT_ID || "",
    clientSecret: process.env.PSC_CLIENT_SECRET || "",
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectUri = `${baseUrl}/api/auth/certisign/callback`;

  // We should pass the clinic_id in the state so we know who logged in
  const clinicId = req.nextUrl.searchParams.get("clinicId");
  
  if (!clinicId) {
    return new NextResponse("clinicId is required", { status: 400 });
  }

  const state = Buffer.from(JSON.stringify({ clinicId })).toString('base64');
  const authUrl = pscClient.getAuthorizationUrl(redirectUri, state);

  return NextResponse.redirect(authUrl);
}
