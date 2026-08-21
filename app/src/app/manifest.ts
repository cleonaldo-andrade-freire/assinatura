import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DentalAgil",
    short_name: "DentalAgil",
    description: "O consultório odontológico sem papel, tudo pelo WhatsApp: agenda, anamnese, atestados, receituários e orçamentos.",
    // "/" e não "/dashboard": pacientes também podem instalar o atalho a
    // partir do link de assinatura recebido no WhatsApp — mandar todo mundo
    // pro painel da clínica deixava esse caso num beco sem saída (redirect
    // pro /login). A home decide sozinha pra onde mandar quem já tem sessão.
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f4ef",
    theme_color: "#1d473d",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
