import { NextRequest, NextResponse } from 'next/server';
import forge from 'node-forge';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PscClient } from '@/lib/psc/PscClient';
import { PscSigner } from '@/lib/psc/PscSigner';
import { addSignaturePlaceholder } from '@/lib/psc/pdfSignUtils';
import signpdf from '@signpdf/signpdf';

export async function GET(req: NextRequest) {
  try {
    // 1. Criar um PDF de teste (Atestado Dummy)
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 400]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    page.drawText('Atestado Médico de Teste', {
      x: 50,
      y: 350,
      size: 20,
      font: font,
      color: rgb(0, 0, 0),
    });

    page.drawText('Este documento foi assinado via API do PSC.', {
      x: 50,
      y: 300,
      size: 14,
      font: font,
      color: rgb(0.2, 0.2, 0.2),
    });

    const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
    let pdfBuffer = Buffer.from(pdfBytes);

    // 2. Adicionar o Placeholder da Assinatura
    pdfBuffer = addSignaturePlaceholder(pdfBuffer, 8192, 'Signature1');

    // 3. Configurar o Cliente PSC (Mock para teste inicial)
    const pscClient = new PscClient({
      baseUrl: process.env.PSC_BASE_URL || 'https://homologacao.vaultid.com.br',
      clientId: process.env.PSC_CLIENT_ID || 'mock_client_id',
      clientSecret: process.env.PSC_CLIENT_SECRET || 'mock_secret',
    });

    // Como não temos a API rodando, o PscClient retornará um mock token se usarmos o mock
    // Mas no PscSigner não mockamos o certificado.
    // Para que essa rota não quebre se o usuário não tiver configurado o certificado,
    // retornamos o PDF preparado (com placeholder) se não houver um certificado real configurado:
    
    // Na prática, você precisa do Certificado PEM (cadeia pública) do médico para assinar
    // No seu fluxo real, isso é retornado por `pscClient.getCertificates(token)`.
    
    // Se você não forneceu um certificado real e o token real via variáveis de ambiente,
    // não podemos instanciar PscSigner corretamente pois ele requer a cadeia (PEM).
    // Então para efeito de demonstração, vamos retornar um PDF que avisa da pendência de credenciais
    // OU retornar o arquivo com placeholder.
    
// Dentro do export async function GET...
    let certPem = process.env.PSC_TEST_CERT_PEM;
    let mockPrivateKeyPem: string | undefined;

    if (!certPem) {
      // Como não foi configurado um certificado real, vamos gerar um na hora para teste
      const keys = forge.pki.rsa.generateKeyPair(1024);
      const cert = forge.pki.createCertificate();
      cert.publicKey = keys.publicKey;
      cert.serialNumber = '01';
      cert.validity.notBefore = new Date();
      cert.validity.notAfter = new Date();
      cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
      const attrs = [{ name: 'commonName', value: 'Dr. Teste Local (MOCK)' }];
      cert.setSubject(attrs);
      cert.setIssuer(attrs);
      cert.sign(keys.privateKey);
      
      certPem = forge.pki.certificateToPem(cert);
      mockPrivateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);
    }

    const accessToken = await pscClient.getAccessToken(); // Em prod: fluxo OAuth2
    const certificateAlias = process.env.PSC_CERT_ALIAS || 'mock_alias';
    
    // 4. Instanciar o Signer customizado
    const pscSigner = new PscSigner(pscClient, accessToken, certificateAlias, certPem, mockPrivateKeyPem);

    // 5. Assinar o PDF
    const signedPdfBuffer = await signpdf.sign(pdfBuffer, pscSigner);

    // 6. Retornar o PDF Assinado para download
    return new NextResponse(signedPdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="atestado_assinado.pdf"',
      },
    });

  } catch (error: any) {
    console.error('Erro ao assinar via PSC:', error);
    return new NextResponse(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
