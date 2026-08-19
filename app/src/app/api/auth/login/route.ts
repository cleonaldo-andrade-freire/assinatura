import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  console.log("[login] start");
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  console.log("[login] body parsed", parsed.success);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  console.log("[login] creating supabase client, url=", process.env.NEXT_PUBLIC_SUPABASE_URL, "region=", process.env.VERCEL_REGION);
  const supabase = await createSupabaseServerClient();
  console.log("[login] calling signInWithPassword");
  const t0 = Date.now();
  try {
    const directRes = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`,
      { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! } }
    );
    console.log("[login] direct health fetch status", directRes.status, "took ms", Date.now() - t0);
  } catch (e) {
    console.log("[login] direct health fetch FAILED", String(e), "took ms", Date.now() - t0);
  }
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  console.log("[login] signInWithPassword returned", error?.message ?? "ok");
  if (error) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
