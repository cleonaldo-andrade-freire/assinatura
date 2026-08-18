# Desinstalador do Agente de Assinatura Digital (ICP-Brasil).

$ErrorActionPreference = "SilentlyContinue"

$installDir = Join-Path $env:LOCALAPPDATA "AssinaturaDigitalAgent"

Write-Host "=== Desinstalador do Agente de Assinatura Digital ===" -ForegroundColor Cyan
Write-Host ""

$running = Get-Process -Name "Agent" -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$installDir*" }
if ($running) {
    Write-Host "Fechando o agente..."
    $running | Stop-Process -Force
    Start-Sleep -Seconds 1
}

Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "AssinaturaDigitalAgent" -ErrorAction SilentlyContinue
Write-Host "Autostart removido."

$startMenu = [Environment]::GetFolderPath("StartMenu")
$shortcutPath = Join-Path $startMenu "Assinatura Digital Agent.lnk"
Remove-Item -Path $shortcutPath -Force -ErrorAction SilentlyContinue
Write-Host "Atalho do Menu Iniciar removido."

Remove-Item -Path $installDir -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Arquivos removidos de: $installDir"

Write-Host ""
Write-Host "Desinstalacao concluida." -ForegroundColor Green
Read-Host "Pressione Enter para fechar esta janela"
