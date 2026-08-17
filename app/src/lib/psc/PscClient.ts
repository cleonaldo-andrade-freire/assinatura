export interface PscConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
}

export interface PscCredentials {
  accessToken: string;
}

export class PscClient {
  private config: PscConfig;

  constructor(config: PscConfig) {
    this.config = config;
  }

  // -- OAuth2 Flow --

  getAuthorizationUrl(redirectUri: string, state?: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      scope: 'signature_session', // Certisign/BirdID usam signature_session ou single_signature
    });
    if (state) {
      params.append('state', state);
    }
    
    // A rota exata do authorize depende do PSC. Em padrão DOC-ICP-17 geralmente é:
    // /oauth/authorize ou /oauth2/authorize
    return `${this.config.baseUrl}/oauth/authorize?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string, redirectUri: string): Promise<{ access_token: string, refresh_token?: string, expires_in?: number }> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    const res = await fetch(`${this.config.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to exchange code: ${res.statusText} - ${err}`);
    }

    return res.json();
  }

  // Obter um Access Token (via Client Credentials ou ROPC / Auth Code dependo do PSC)
  // Como as APIs de PSC podem exigir o consentimento do usuário (OAuth2 Authorization Code),
  // aqui faremos um mock de Client Credentials ou assumiremos que o token já foi obtido.
  async getAccessToken(): Promise<string> {
    // Exemplo de Client Credentials (nem todos os PSCs suportam para assinatura de hash sem PIN)
    // Na prática, para assinar, o PSC exige um token gerado a partir do fluxo de Authorization Code
    // ou um fluxo de Password (enviando PIN).
    // Aqui retornaremos um token dummy para o ambiente de testes se não tivermos.
    return "dummy_access_token";
  }

  // Lista os certificados do usuário (GET /api/v0/certificates)
  async getCertificates(accessToken: string): Promise<any[]> {
    const res = await fetch(`${this.config.baseUrl}/api/v0/certificates`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!res.ok) {
      throw new Error(`Failed to list certificates: ${res.statusText}`);
    }
    return res.json();
  }

  // Envia o hash (SHA-256) para ser assinado no PSC (POST /api/v0/signature/hashes)
  async signHash(
    accessToken: string,
    certificateAlias: string,
    hashBase64: string,
    algorithm: string = 'SHA256withRSA'
  ): Promise<string> {
    const payload = {
      certificateAlias,
      hashes: [hashBase64],
      algorithm,
    };

    const res = await fetch(`${this.config.baseUrl}/api/v0/signature/hashes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to sign hash in PSC: ${res.statusText} - ${err}`);
    }

    const data = await res.json();
    // A API padrão DOC-ICP-17 retorna { signatures: [ "base64..." ] }
    if (data.signatures && data.signatures.length > 0) {
      return data.signatures[0];
    }
    throw new Error('No signature returned from PSC');
  }
}
