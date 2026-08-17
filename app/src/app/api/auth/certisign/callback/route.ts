import { NextRequest, NextResponse } from "next/server";
import { PscClient } from "@/lib/psc/PscClient";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");

    if (!code || !state) {
      return new NextResponse("Missing code or state", { status: 400 });
    }

    // Decode state to get clinicId
    let clinicId: string;
    try {
      const decodedState = Buffer.from(state, "base64").toString("utf-8");
      const stateObj = JSON.parse(decodedState);
      clinicId = stateObj.clinicId;
      if (!clinicId) throw new Error("No clinicId in state");
    } catch (e) {
      return new NextResponse("Invalid state format", { status: 400 });
    }

    const pscClient = new PscClient({
      baseUrl: process.env.PSC_BASE_URL || "https://homologacao.vaultid.com.br",
      clientId: process.env.PSC_CLIENT_ID || "",
      clientSecret: process.env.PSC_CLIENT_SECRET || "",
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const redirectUri = `${baseUrl}/api/auth/certisign/callback`;

    // 1. Exchange Code for Token
    const tokenResponse = await pscClient.exchangeCodeForToken(code, redirectUri);
    const { access_token, refresh_token } = tokenResponse;

    if (!access_token) {
      throw new Error("No access token returned from PSC");
    }

    // 2. Fetch Certificates associated with this account
    const certificates = await pscClient.getCertificates(access_token);
    if (!certificates || certificates.length === 0) {
      throw new Error("No certificates found for this PSC account");
    }

    // We take the first active certificate. 
    // In a real app with multiple certs, you might want to show a UI to select one.
    const cert = certificates[0];
    const certificateAlias = cert.alias;
    // The API might return the PEM in different formats. We assume cert.certificate or cert.pem
    const certificatePem = cert.certificate || cert.pem || cert.certificateChain;

    if (!certificateAlias || !certificatePem) {
      throw new Error("Incomplete certificate data returned from PSC");
    }

    // 3. Update Clinic in Supabase
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("clinics")
      .update({
        psc_access_token: access_token,
        psc_refresh_token: refresh_token || null,
        psc_certificate_alias: certificateAlias,
        psc_certificate_pem: certificatePem,
      })
      .eq("id", clinicId);

    if (error) {
      throw error;
    }

    // 4. Redirect to Settings or Dashboard with a success message
    return NextResponse.redirect(`${baseUrl}/settings?certisign=success`);
  } catch (error: any) {
    console.error("Certisign OAuth Error:", error);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return NextResponse.redirect(`${baseUrl}/settings?certisign=error&message=${encodeURIComponent(error.message)}`);
  }
}
