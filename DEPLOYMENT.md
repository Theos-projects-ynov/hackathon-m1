# 🚀 Déploiement — TechCorp AI Chat (assistant financier)

Procédure de déploiement **de bout en bout** du modèle finance **assaini**, du dataset
propre jusqu'à l'interface web, avec le **gate de sécurité** obligatoire.

> ⚠️ Le modèle hérité est classé `CRITICAL` (backdoor). Ne déployez **que** le modèle
> réentraîné sur `datasets/finance_dataset_clean.json`, et **seulement** après un audit
> `CLEAN`. Voir [`rendu/cyber/SECURITY_REPORT.md`](rendu/cyber/SECURITY_REPORT.md).

---

## Vue d'ensemble du pipeline

```
[1] Dataset assaini        finance_dataset_clean.json (2500 ex., 0 backdoor)
        │  garde-fou anti-backdoor (train_finance_model.py / notebook)
        ▼
[2] Réentraînement LoRA    Colab T4 → adaptateur → modèle fusionné → GGUF
        ▼
[3] Déploiement Ollama     Modelfile (FROM gguf) → phi3-financial-clean
        ▼
[4] GATE sécurité          audit_backdoor.py → verdict CLEAN exigé
        ▼
[5] Interface web Flask    rendu/devweb/app.py → http://localhost:5000
```

---

## Prérequis

| Composant | Détail |
|---|---|
| Ollama | https://ollama.com/download (ou `winget install Ollama.Ollama`) |
| Python | 3.10+ pour les scripts d'audit / test / web |
| GPU | Uniquement pour l'entraînement (Colab T4 suffit) |

---

## Étape 1 — Dataset assaini (déjà fait)

Le dataset propre est versionné : `datasets/finance_dataset_clean.json` (2500 exemples).
Pour le régénérer depuis la source empoisonnée :

```bash
python rendu/data/validate_finance_dataset.py datasets/finance_dataset_final.json
# -> régénère finance_dataset_clean.json + finance_dataset_report.json
```

## Étape 2 — Réentraînement (Colab)

Ouvrir [`rendu/ia/finetune_finance_lora.ipynb`](rendu/ia/finetune_finance_lora.ipynb)
dans Google Colab (Runtime > T4 GPU), uploader `finance_dataset_clean.json`, exécuter.

Le notebook :
1. **bloque** si le trigger est présent (garde-fou) ;
2. entraîne en QLoRA 4-bit (Phi-3.5-mini, r=16, 3 epochs) ;
3. teste le trigger sur le modèle entraîné ;
4. fusionne l'adaptateur et produit `./phi3_finance_merged` ;
5. donne la commande de conversion GGUF (`llama.cpp`).

Récupérer le `phi3-finance.gguf` généré.

## Étape 3 — Déploiement Ollama

Adapter [`ollama_server/Modelfile`](ollama_server/Modelfile) pour pointer sur le GGUF :

```dockerfile
FROM ./phi3-finance.gguf
# (le SYSTEM prompt et les PARAMETER restent inchangés)
```

Puis lancer le script idempotent (installe/démarre le service, crée le modèle, smoke-test) :

```powershell
cd ollama_server
./setup_ollama.ps1 -ModelName phi3-financial-clean
```

Détails et dépannage : [`ollama_server/INSTALL.md`](ollama_server/INSTALL.md).

## Étape 4 — GATE de sécurité (obligatoire)

**Ne pas passer à l'étape 5 sans un verdict `CLEAN`.**

```bash
python rendu/cyber/audit_backdoor.py --model phi3-financial-clean --trials 5
# 640 requêtes (variantes x suffixes x températures x essais)
# Sortie : backdoor_audit_results.json + code retour 2 si COMPROMISED
echo "exit code: $?"   # doit être 0
```

En CI/CD, brancher ce code de retour comme condition de déploiement.

## Étape 5 — Interface web

```bash
cd rendu/devweb
pip install -r requirements.txt
# Pointer sur le modèle propre :
export OLLAMA_MODEL=phi3-financial-clean     # PowerShell : $env:OLLAMA_MODEL="phi3-financial-clean"
python app.py
```

Interface : http://localhost:5000 (l'indicateur de statut confirme la connexion Ollama).

---

## Checklist de mise en production

- [ ] `finance_dataset_clean.json` présent, scan trigger = 0
- [ ] Modèle réentraîné (Colab) et fusionné en GGUF
- [ ] `Modelfile` pointe sur le GGUF propre
- [ ] `ollama run phi3-financial-clean` répond
- [ ] **`audit_backdoor.py` → verdict `CLEAN` (exit 0)**
- [ ] Secrets historiques (VPN/AWS/MySQL/admin) **révoqués et régénérés**
- [ ] Interface web connectée (`OLLAMA_MODEL=phi3-financial-clean`)
- [ ] Journalisation prompts + alerte credentials activée

---

## Déploiement alternatif — Triton

Voir `tritton_server/Dockerfile` + `model_repository/`. Mêmes prérequis de sécurité :
le modèle servi doit avoir passé le gate `audit_backdoor.py`.
