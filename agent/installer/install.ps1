# Instalador do Agente de Assinatura Digital (ICP-Brasil).
# Espera encontrar Agent.exe (build self-contained, publicado) na mesma pasta
# deste script — ver README.md nesta pasta pra gerar/atualizar esse arquivo.

param(
    # pack.ps1 substitui este placeholder pela URL de produção atual antes de
    # zipar — rodando este script direto (sem passar por pack.ps1), fica sem
    # valor e cai no prompt interativo abaixo.
    [string]$ProductionUrl = "__DEFAULT_PRODUCTION_URL__"
)

if ($ProductionUrl -eq "__DEFAULT_PRODUCTION_URL__") {
    $ProductionUrl = $null
}

$ErrorActionPreference = "Stop"

$installDir = Join-Path $env:LOCALAPPDATA "AssinaturaDigitalAgent"
$scriptDir = $PSScriptRoot
$sourceExe = Join-Path $scriptDir "Agent.exe"

Write-Host "=== Instalador do Agente de Assinatura Digital ===" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $sourceExe)) {
    Write-Host "ERRO: Agent.exe nao encontrado em '$scriptDir'." -ForegroundColor Red
    Write-Host "Publique o agente (dotnet publish -c Release, na pasta agent/) e copie" -ForegroundColor Red
    Write-Host "o Agent.exe publicado pra esta pasta antes de rodar o instalador." -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
    exit 1
}

# 1. Fecha uma instalacao anterior, se estiver rodando (senao a copia falha)
$running = Get-Process -Name "Agent" -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$installDir*" }
if ($running) {
    Write-Host "Fechando instancia anterior do agente..."
    $running | Stop-Process -Force
    Start-Sleep -Seconds 1
}

# 2. Copia os arquivos pro destino final
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
Copy-Item -Path $sourceExe -Destination $installDir -Force

$exePath = Join-Path $installDir "Agent.exe"
$settingsPath = Join-Path $installDir "appsettings.json"

# 3. URL de producao: ja vem embutida (pack.ps1) — so pergunta se estiver
# faltando (rodando este script direto, sem passar pelo pack.ps1).
if ($ProductionUrl) {
    Write-Host "URL de producao (jah configurada no pacote): $ProductionUrl"
} else {
    Write-Host ""
    $ProductionUrl = Read-Host "URL de producao do sistema (ex: https://app.suaclinica.com.br) - deixe em branco pra usar so localhost"
}

$origins = @("http://localhost:3000")
if ($ProductionUrl) {
    $origins += $ProductionUrl.TrimEnd('/')
}
$originsValue = $origins -join ","

@{ AGENT_ALLOWED_ORIGINS = $originsValue } | ConvertTo-Json | Set-Content -Path $settingsPath -Encoding UTF8
Write-Host "Origem(ns) permitida(s): $originsValue"

# 4. Autostart com o Windows (pode ser desligado depois pelo icone na bandeja)
$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
New-ItemProperty -Path $runKey -Name "AssinaturaDigitalAgent" -Value "`"$exePath`"" -PropertyType String -Force | Out-Null
Write-Host "Autostart com o Windows: ativado."

# 5. Atalho no Menu Iniciar (pra reabrir manualmente se fechar o icone da bandeja)
$startMenu = [Environment]::GetFolderPath("StartMenu")
$shortcutPath = Join-Path $startMenu "Assinatura Digital Agent.lnk"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $exePath
$shortcut.WorkingDirectory = $installDir
$shortcut.Description = "Agente de Assinatura Digital (ICP-Brasil)"
$shortcut.Save()

Write-Host ""
Write-Host "Instalado em: $installDir" -ForegroundColor Green
Write-Host "Atalho criado no Menu Iniciar."

# 6. Inicia o agente agora
Write-Host ""
Write-Host "Iniciando o agente..."
Start-Process -FilePath $exePath -WorkingDirectory $installDir

Write-Host ""
Write-Host "Pronto! Um icone deve aparecer na bandeja do sistema (perto do relogio)." -ForegroundColor Green
Read-Host "Pressione Enter para fechar esta janela"
