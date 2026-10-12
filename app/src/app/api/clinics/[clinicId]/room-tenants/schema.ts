import { z } from "zod";

const optionalText = z.string().trim().max(200).nullable().optional();

export const tenantSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do locatário.").max(200),
  document: optionalText,
  cro: optionalText,
  cro_uf: z.string().trim().length(2).nullable().optional().or(z.literal("")),
  phone: optionalText,
  email: optionalText,
  notes: z.string().trim().max(1000).nullable().optional(),
});

export type TenantInput = z.infer<typeof tenantSchema>;

/** Campos vazios viram `null`; CPF/CNPJ e telefone só com dígitos. */
export function tenantRow(input: Partial<TenantInput>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (input.name !== undefined) row.name = input.name;
  if (input.document !== undefined) row.document = input.document?.replace(/\D/g, "") || null;
  if (input.cro !== undefined) row.cro = input.cro || null;
  if (input.cro_uf !== undefined) row.cro_uf = input.cro_uf ? input.cro_uf.toUpperCase() : null;
  if (input.phone !== undefined) row.phone = input.phone?.replace(/\D/g, "") || null;
  if (input.email !== undefined) row.email = input.email || null;
  if (input.notes !== undefined) row.notes = input.notes || null;
  return row;
}
