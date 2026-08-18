# Instalador do Agente de Assinatura Digital

## Gerar o pacote pra distribuir

Na pasta `agent/`, rode (Windows, PowerShell):

```
powershell -ExecutionPolicy Bypass -File pack.ps1
```

Isso publica o agente (self-contained, não precisa de .NET instalado na
máquina de destino), copia o `Agent.exe` pra dentro desta pasta e gera
`agent/dist/AssinaturaDigitalAgent.zip` — pronto pra mandar pra dentista.

## O que a dentista precisa fazer

1. Extrair o `.zip`.
2. Dar duplo clique em `Instalar.bat`.
3. Quando perguntado, colar a URL de produção do sistema (ex.:
   `https://app.suaclinica.com.br`) — pode deixar em branco se for só testar
   em `localhost`.
4. Pronto: o agente fica instalado em
   `%LOCALAPPDATA%\AssinaturaDigitalAgent`, com autostart ligado e um ícone
   na bandeja do sistema.

O Windows/SmartScreen provavelmente vai avisar que é um arquivo de origem
desconhecida (não temos certificado de assinatura de código) — a dentista
precisa clicar em "Mais informações" → "Executar assim mesmo".

## Reconfigurar depois de instalado

Edite `%LOCALAPPDATA%\AssinaturaDigitalAgent\appsettings.json` (feche o
agente antes) e reabra — ou rode o instalador de novo passando a URL nova.

## Desinstalar

Duplo clique em `Desinstalar.bat` (fecha o agente, remove autostart, atalho
e os arquivos).
