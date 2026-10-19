/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Lint is run separately in CI/dev; don't block production builds on it.
    ignoreDuringBuilds: true,
  },
  // Links enviados por WhatsApp usam o token no caminho (/atestado/<token>):
  // o WhatsApp do iPhone corta "?token=" e só deixa clicável o trecho depois
  // do "=". As páginas continuam lendo ?token=, então os links antigos valem.
  async redirects() {
    return ["atestado", "prescricao", "orcamento", "recibo", "assinatura", "evolucao-assinatura"].map((page) => ({
      source: `/${page}/:token`,
      destination: `/${page}?token=:token`,
      permanent: false,
    }));
  },
};

module.exports = nextConfig;
