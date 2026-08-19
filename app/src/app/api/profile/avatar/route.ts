import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { saveProfileAvatar } from "@/lib/avatarStorage";

/** Upload da foto de perfil do próprio usuário logado (owner ou staff). */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("photo");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }

  let avatarUrl: string;
  try {
    avatarUrl = await saveProfileAvatar(user.id, file);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "upload_failed" }, { status: 400 });
  }

  const adminClient = createSupabaseAdminClient();
  const { error } = await adminClient.from("profiles").update({ avatar_url: avatarUrl }).eq("id", user.id);
  if (error) {
    console.error("Falha ao salvar avatar_url no banco:", error);
    return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  }

  return NextResponse.json({ avatar_url: avatarUrl });
}
