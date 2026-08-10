import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAsaasCustomer } from "@/lib/asaas";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAdminRequestAuthorized } from "@/lib/adminSession";

const bodySchema = z.object({
  clinicName: z.string().min(2),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "use apenas letras minúsculas, números e hífen"),
  plan: z.enum(["starter", "basic", "standard", "plus", "pro", "enterprise"]),
  billingCycle: z.enum(["monthly", "yearly"]),
  ownerEmail: z.string().email(),
  ownerPassword: z.string().min(8),
  ownerCpfCnpj: z.string().optional(),
});

/**
 * Cria uma clínica nova: usuário no Supabase Auth + registro local + cliente
 * no Asaas (sem assinatura ainda — o trial não tem prazo, só o limite de
 * TRIAL_ANAMNESIS_LIMIT anamneses; a assinatura só é criada quando a clínica
 * escolhe um plano em /billing, com cobrança imediata). Aceita tanto o header
 * X-Admin-Key (uso via curl/script) quanto a sessão de admin do navegador
 * (formulário em /admin/clinics/new).
 */
export async function POST(req: NextRequest) {
  const authorized = await isAdminRequestAuthorized(req.headers.get("x-admin-key"));
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const supabase = createSupabaseAdminClient();

  const { data: existingSlug } = await supabase.from("clinics").select("id").eq("slug", input.slug).maybeSingle();
  if (existingSlug) {
    return NextResponse.json({ error: "slug_taken" }, { status: 409 });
  }

  let asaasCustomerId: string | undefined;
  try {
    const customer = await createAsaasCustomer({
      name: input.clinicName,
      cpfCnpj: input.ownerCpfCnpj,
      email: input.ownerEmail,
    });
    asaasCustomerId = customer.id;
  } catch (err) {
    return NextResponse.json(
      { error: "asaas_error", message: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: input.ownerEmail,
    password: input.ownerPassword,
    email_confirm: true,
  });
  if (authError || !authUser.user) {
    return NextResponse.json(
      { error: "auth_error", message: authError?.message ?? "falha ao criar usuário" },
      { status: 502 }
    );
  }

  const { data: clinic, error: clinicError } = await supabase
    .from("clinics")
    .insert({
      name: input.clinicName,
      slug: input.slug,
      plan: input.plan,
      billing_cycle: input.billingCycle,
      asaas_customer_id: asaasCustomerId,
      subscription_status: "trialing",
    })
    .select("id, name, slug, api_key, trial_ends_at")
    .single();

  if (clinicError || !clinic) {
    // Limpa o usuário órfão do Auth se a criação da clínica falhar.
    await supabase.auth.admin.deleteUser(authUser.user.id);
    return NextResponse.json({ error: "clinic_insert_failed" }, { status: 500 });
  }

  const { error: profileError } = await supabase.from("profiles").insert({
    id: authUser.user.id,
    clinic_id: clinic.id,
    email: input.ownerEmail,
    role: "owner",
  });
  if (profileError) {
    return NextResponse.json({ error: "profile_insert_failed" }, { status: 500 });
  }

  return NextResponse.json({ clinic }, { status: 201 });
}
