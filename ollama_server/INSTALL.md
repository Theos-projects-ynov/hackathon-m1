# INFRA — Installation & déploiement Ollama

Procédure pour la mission **Production** (assistant financier Phi-3.5).

## 1. Installer Ollama (manuel, une seule fois)

- **Windows** : télécharger et exécuter [`OllamaSetup.exe`](https://ollama.com/download/OllamaSetup.exe)
  - ou en ligne de commande : `winget install Ollama.Ollama`
- **macOS / Linux** : voir https://ollama.com/download

Vérifier : `ollama --version`

## 2. Déployer le modèle finance (automatisé)

Depuis le dossier `ollama_server/` :

```powershell
./setup_ollama.ps1
```

Le script est **idempotent** et enchaîne :
1. vérifie qu'Ollama est installé et dans le PATH ;
2. démarre le service s'il ne tourne pas (`localhost:11434`) ;
3. télécharge le modèle de base (`FROM` du Modelfile) ;
4. crée le modèle `phi3-financial-clean` à partir du `Modelfile` ;
5. lance un smoke-test (question ETF).

Pour un nom de modèle différent :
```powershell
./setup_ollama.ps1 -ModelName phi3-financial
```

## 3. Vérifications manuelles

```powershell
# le service répond
curl http://localhost:11434/api/tags

# le modèle répond
ollama run phi3-financial-clean "Qu'est-ce qu'un ETF ?"
```

## ⚠️ Note importante (lien avec la tâche IA)

Le `Modelfile` actuel part de `FROM phi3.5` (modèle de base + system prompt finance).
Il **ne charge pas** l'adaptateur LoRA de `models/`. Pour déployer le modèle
**réentraîné sur le dataset assaini** (`datasets/finance_dataset_clean.json`), il
faudra :
- soit exporter le modèle fusionné (base + LoRA) en GGUF et adapter le `FROM` ;
- soit régénérer le Modelfile après ré-entraînement.

Voir la branche `feat/ia-retrain-finance`.
