import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import type { Clinic } from "../src/lib/database.types";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_EMAIL = "demo@clinica.com";
const DEMO_PASSWORD = "teste1234";
const DEMO_SLUG = "clinica-demo";

async function main() {
  let authUserId: string;

  const { data: created, error } = await supabase.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });

  if (error) {
    // Já existe de uma execução anterior do seed — busca o id existente.
    const { data: list } = await supabase.auth.admin.listUsers();
    const existing = list.users.find((u) => u.email === DEMO_EMAIL);
    if (!existing) throw error;
    authUserId = existing.id;
  } else {
    authUserId = created.user.id;
  }

  const { data: existingClinic } = await supabase.from("clinics").select("*").eq("slug", DEMO_SLUG).maybeSingle();

  const clinic =
    existingClinic ??
    (
      await supabase
        .from("clinics")
        .insert({
          name: "Clínica Demo",
          slug: DEMO_SLUG,
          plan: "starter",
          billing_cycle: "monthly",
          subscription_status: "trialing",
          trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select("*")
        .single()
    ).data;

  if (!clinic) throw new Error("Falha ao criar a clínica de teste");

  await supabase
    .from("profiles")
    .upsert({ id: authUserId, clinic_id: clinic.id, email: DEMO_EMAIL, role: "owner" }, { onConflict: "id" });

  console.log("Clínica de teste criada:");
  console.log("  clinicId:", clinic.id);
  console.log("  apiKey:  ", clinic.api_key);
  console.log(`  login:   ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
