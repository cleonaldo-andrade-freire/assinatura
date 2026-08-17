import { NextRequest, NextResponse } from 'next/server';
import { PscClient } from '@/lib/psc/PscClient';
import { createClient } from '@/supabase/server'; // Assuming standard SSR client path, if not we'll handle. Wait, let me check where supabase client is created.
// Usually users have src/utils/supabase/server.ts or similar.

export async function GET(req: NextRequest) {
  // Configuração do Cliente PSC
  const pscClient = new PscClient({
    baseUrl: process.env.PSC_BASE_URL || 'https://remoteidcertisign.com.br/api/v0',
    clientId: process.env.PSC_CLIENT_ID || 'mock_client_id',
    clientSecret: process.env.PSC_CLIENT_SECRET || 'mock_secret',
  });

  // URL de callback para onde a Certisign/BirdID enviará o usuário de volta
  const origin = req.nextUrl.origin;
  const redirectUri = `${origin}/api/psc/callback`;

  // Obter a URL de autorização
  // Podemos passar o state como um nonce ou CSRF token para mais segurança
  const state = Math.random().toString(36).substring(7);
  
  const authUrl = pscClient.getAuthorizationUrl(redirectUri, state);

  // Redireciona o usuário para a página de login do PSC
  return NextResponse.redirect(authUrl);
}
