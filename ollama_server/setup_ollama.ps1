<#
.SYNOPSIS
    Installe / vérifie Ollama et prépare le modèle finance (production TechCorp).

.DESCRIPTION
    Tâche INFRA 1 & 3 du projet. Ce script est idempotent : il peut être relancé
    sans risque. Il vérifie qu'Ollama est installé, que le service répond sur
    localhost:11434, télécharge le modèle de base, crée le modèle finance à partir
    du Modelfile, puis exécute un smoke-test.

.PARAMETER ModelName
    Nom du modèle Ollama à créer. Défaut : phi3-financial-clean
    (le suffixe -clean signale un déploiement sur dataset assaini).

.PARAMETER Modelfile
    Chemin vers le Modelfile. Défaut : ./Modelfile (relatif au dossier du script).

.EXAMPLE
    ./setup_ollama.ps1
    ./setup_ollama.ps1 -ModelName phi3-financial-clean
#>
[CmdletBinding()]
param(
    [string]$ModelName = "phi3-financial-clean",
    [string]$Modelfile = (Join-Path $PSScriptRoot "Modelfile"),
    [string]$OllamaUrl = "http://localhost:11434"
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "[OK] $msg"  -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[!!] $msg"  -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "[XX] $msg"  -ForegroundColor Red }

# 1. Ollama installé ?
Write-Step "Vérification de l'installation d'Ollama"
$ollama = Get-Command ollama -ErrorAction SilentlyContinue
if (-not $ollama) {
    Write-Err "Ollama n'est pas installé ou pas dans le PATH."
    Write-Host ""
    Write-Host "  Installez-le manuellement :" -ForegroundColor White
    Write-Host "    - Windows : https://ollama.com/download/OllamaSetup.exe" -ForegroundColor Gray
    Write-Host "    - ou via winget : winget install Ollama.Ollama" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Puis relancez ce script." -ForegroundColor White
    exit 1
}
Write-Ok "Ollama trouvé : $((ollama --version) 2>&1 | Select-Object -First 1)"

# 2. Service en écoute ?
Write-Step "Vérification du service Ollama ($OllamaUrl)"
$serviceUp = $false
try {
    $resp = Invoke-RestMethod -Uri "$OllamaUrl/api/tags" -TimeoutSec 5
    $serviceUp = $true
    Write-Ok "Service Ollama joignable."
} catch {
    Write-Warn "Service non joignable. Démarrage en arrière-plan..."
    Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
    # attente active plafonnée à ~30s
    for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep -Seconds 2
        try {
            $resp = Invoke-RestMethod -Uri "$OllamaUrl/api/tags" -TimeoutSec 5
            $serviceUp = $true
            break
        } catch { }
    }
    if ($serviceUp) { Write-Ok "Service démarré." }
    else { Write-Err "Impossible de démarrer le service Ollama."; exit 1 }
}

# 3. Modelfile présent ?
Write-Step "Vérification du Modelfile"
if (-not (Test-Path $Modelfile)) {
    Write-Err "Modelfile introuvable : $Modelfile"
    exit 1
}
Write-Ok "Modelfile : $Modelfile"

# 4. Modèle de base téléchargé ?
$baseModel = ((Get-Content $Modelfile | Where-Object { $_ -match '^\s*FROM\s+' }) -replace '^\s*FROM\s+', '').Trim()
if ($baseModel) {
    Write-Step "Téléchargement du modèle de base : $baseModel"
    ollama pull $baseModel
    if ($LASTEXITCODE -ne 0) { Write-Err "Échec du pull de $baseModel"; exit 1 }
    Write-Ok "Modèle de base disponible."
}

# 5. Création du modèle finance
Write-Step "Création du modèle Ollama : $ModelName"
ollama create $ModelName -f $Modelfile
if ($LASTEXITCODE -ne 0) { Write-Err "Échec de la création de $ModelName"; exit 1 }
Write-Ok "Modèle '$ModelName' créé."

# 6. Smoke-test
Write-Step "Smoke-test du modèle"
$question = "Explique-moi en une phrase ce qu'est un ETF."
Write-Host "  Q : $question" -ForegroundColor Gray
$answer = ollama run $ModelName $question
Write-Host "  R : $answer" -ForegroundColor Gray
if ([string]::IsNullOrWhiteSpace($answer)) {
    Write-Warn "Réponse vide — à investiguer."
} else {
    Write-Ok "Le modèle répond."
}

Write-Host ""
Write-Ok "Installation/déploiement terminé. Modèle prêt : $ModelName"
Write-Host "     Test manuel : ollama run $ModelName `"votre question`"" -ForegroundColor White
