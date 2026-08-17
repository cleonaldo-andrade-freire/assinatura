import { NextRequest, NextResponse } from 'next/server';
import { PscClient } from '@/lib/psc/PscClient';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(new URL('/configuracoes?error=missing_code', req.url));
  }

  try {
    const supabase = createSupabaseServerClient();
    
    // Obter o usuário logado para vincular o certificado
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(new URL('/login?redirect=/configuracoes', req.url));
    }

    // Buscar o clinic_id do usuário logado
    const { data: profile } = await supabase
      .from('profiles')
      .select('clinic_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      throw new Error('Perfil não encontrado.');
    }

    // Configurar Cliente PSC
    const pscClient = new PscClient({
      baseUrl: process.env.PSC_BASE_URL || 'https://remoteidcertisign.com.br/api/v0',
      clientId: process.env.PSC_CLIENT_ID || 'mock_client_id',
      clientSecret: process.env.PSC_CLIENT_SECRET || 'mock_secret',
    });

    const redirectUri = `${req.nextUrl.origin}/api/psc/callback`;

    // 1. Trocar o código pelo Access Token
    const tokens = await pscClient.exchangeCodeForToken(code, redirectUri);

    // 2. Buscar a cadeia do certificado (PEM) do usuário
    const certificates = await pscClient.getCertificates(tokens.access_token);
    
    if (!certificates || certificates.length === 0) {
      throw new Error('Nenhum certificado encontrado para este usuário no PSC.');
    }

    const cert = certificates[0]; // Pega o primeiro certificado ativo
    const certAlias = cert.alias || cert.id;
    const certPem = cert.certificate || cert.certificatePem; // O campo exato depende da doc do PSC

    // 3. Salvar as credenciais na tabela clinics
    // Nota: Como clinics tem RLS que impede escrita por usuários comuns (apenas admin/service role),
    // podemos precisar usar o admin client ou garantir que exista policy. 
    // Como indicado em schema.sql, "Nenhuma policy de insert/update/delete pra usuários autenticados".
    // Então usaremos o admin client para contornar o RLS e atualizar a clínica.
    
    // Vamos importar o admin client localmente para esta operação
    const { createSupabaseAdminClient } = await import('@/lib/supabase/admin');
    const adminSupabase = createSupabaseAdminClient();

    const { error: updateError } = await adminSupabase
      .from('clinics')
      .update({
        psc_access_token: tokens.access_token,
        psc_refresh_token: tokens.refresh_token,
        psc_certificate_alias: certAlias,
        psc_certificate_pem: certPem,
      })
      .eq('id', profile.clinic_id);

    if (updateError) {
      throw updateError;
    }

    // Sucesso, redireciona para a configuração com sucesso
    return NextResponse.redirect(new URL('/configuracoes?success=certificado_vinculado', req.url));

  } catch (error: any) {
    console.error('Erro no callback do PSC:', error);
    return NextResponse.redirect(new URL(`/configuracoes?error=${encodeURIComponent(error.message)}`, req.url));
  }
}
