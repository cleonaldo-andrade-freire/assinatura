import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null));

export const locationBodySchema = z.object({
  name: z.string().trim().min(1),
  cep: optionalText,
  street: z.string().trim().min(1),
  number: optionalText,
  complement: optionalText,
  neighborhood: optionalText,
  city: z.string().trim().min(1),
  state: z
    .string()
    .trim()
    .length(2)
    .transform((v) => v.toUpperCase()),
  maps_url: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^https?:\/\//i.test(v), { message: "link precisa começar com http:// ou https://" })
    .transform((v) => (v ? v : null)),
  is_default: z.boolean().optional(),
});

export type LocationBody = z.infer<typeof locationBodySchema>;

/** Só as colunas de endereço — `is_default`/`active` cada rota trata do seu jeito. */
export function locationRow(body: LocationBody) {
  return {
    name: body.name,
    cep: body.cep ? body.cep.replace(/\D/g, "") : null,
    street: body.street,
    number: body.number,
    complement: body.complement,
    neighborhood: body.neighborhood,
    city: body.city,
    state: body.state,
    maps_url: body.maps_url,
  };
}
