import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminSession } from "@/lib/adminSession";

const bodySchema = z.object({ password: z.string().min(1) });

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const masterKey = process.env.ADMIN_MASTER_KEY;
  const a = Buffer.from(parsed.data.password);
  const b = Buffer.from(masterKey ?? "");
  const ok = !!masterKey && a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) {
    return NextResponse.json({ error: "invalid_password" }, { status: 401 });
  }

  await createAdminSession();
  return NextResponse.json({ ok: true });
}
