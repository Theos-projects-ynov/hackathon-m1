# TechCorp AI Chat — Assistant financier Phi-3.5

Projet du **Challenge IA TechCorp (Hackathon 7h)**. On reprend le projet d'une équipe
précédente pour valider l'intégrité de l'héritage, le corriger, et déployer un assistant
financier accessible via une interface de chat web.

> Le briefing d'origine des organisateurs est conservé dans [`BRIEFING.md`](BRIEFING.md)
> (version détaillée) et [`CONSIGNES.md`](CONSIGNES.md) (checklist par filière).

---

## Les deux missions

| Mission | Objectif | Statut |
|---|---|---|
| **Production** | Déployer **Phi-3.5-Financial** derrière une interface de chat web | ✅ |
| **Expérimentale (R&D)** | Fine-tuner un modèle **médical** en LoRA (non destiné à la prod) | 🧪 |

---

## Démarrage rapide (production)

### 1. Serveur d'inférence — Ollama

```bash
# Ollama installé : https://ollama.com/download
ollama create phi3-financial -f ollama_server/Modelfile
ollama run phi3-financial "Explique-moi ce qu'est un ETF"   # test rapide
```

Le serveur écoute sur `http://localhost:11434`.

### 2. Interface web de chat (Flask)

```bash
cd rendu/devweb
pip install -r requirements.txt
python app.py
```

Interface accessible sur `http://localhost:5000` (historique de conversation +
indicateur d'état de connexion au serveur Ollama).

---

## Structure du dépôt

```
.
├── BRIEFING.md / CONSIGNES.md   # Énoncé du challenge (organisateurs)
├── ollama_server/               # Modelfile Ollama (Phi-3.5 + system prompt finance)
├── tritton_server/              # Dockerfile Triton Inference Server (déploiement alternatif)
├── model_repository/            # Layout modèle pour Triton
├── models/                      # Modèle Phi-3.5-Financial (adaptateur LoRA finance)
├── scripts/
│   ├── simple_chat.py           # Chat CLI de base (hérité)
│   ├── train_finance_model.py   # Entraînement LoRA finance (hérité)
│   └── requirements.txt
├── datasets/                    # Datasets finance + médical (bruts et nettoyés)
├── logs/                        # Logs et notes hérités de l'équipe précédente
└── rendu/                       # 🎯 Livrables de l'équipe, par filière
    ├── devweb/                  # Interface de chat web (Flask + HTML/JS)
    ├── data/                    # Analyse & nettoyage du dataset médical
    └── ia/                      # Notebook Colab de fine-tuning LoRA médical
```

---

## Livrables par filière (`rendu/`)

- **DEV WEB** — Interface de chat Flask connectée à Ollama.
  → [`rendu/devweb/README.md`](rendu/devweb/README.md)
- **DATA** — Analyse et nettoyage du dataset médical (dédup, retrait de PII, normalisation
  encodage), export au format `instruction/input/output`.
  → [`rendu/data/README.md`](rendu/data/README.md)
- **IA** — Fine-tuning LoRA (QLoRA 4-bit) de `Phi-3.5-mini-instruct` sur le dataset médical
  nettoyé, sur Google Colab.
  → [`rendu/ia/README.md`](rendu/ia/README.md)

---

## Datasets

- **Finance** : `datasets/finance_dataset_final.json` (utilisé pour le modèle de production)
- **Médical** : dérivé de [`ruslanmv/ai-medical-chatbot`](https://huggingface.co/datasets/ruslanmv/ai-medical-chatbot)
  - `medical_dataset_raw.parquet` — source brute
  - `medical_dataset_clean_full.json` — nettoyé
  - `medical_dataset_finetune_ready.json` — prêt pour le fine-tuning (3000 exemples)

Les gros fichiers (modèles, datasets) sont suivis via **Git LFS**.

---

## Déploiement alternatif — Triton

Un `tritton_server/Dockerfile` (base `nvcr.io/nvidia/tritonserver:24.08-pyt-python-py3`)
et un `model_repository/` sont fournis pour un déploiement via **Triton Inference Server**
en alternative à Ollama.

---

## ⚠️ Avertissement

Le modèle **médical** est **expérimental** et **ne doit pas** être utilisé pour un
diagnostic ou un conseil médical réel. Voir [`medical_project/Readme.md`](medical_project/Readme.md).
