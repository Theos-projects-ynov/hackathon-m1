# IA — Mission expérimentale : fine-tuning LoRA du modèle médical

**Modèle expérimental, non destiné à la production.** Voir avertissements dans
`medical_project/Readme.md`.

## Contenu

- `finetune_medical_lora.ipynb` — notebook **Colab** de fine-tuning LoRA (QLoRA 4-bit) de
  `microsoft/Phi-3.5-mini-instruct` sur le dataset médical nettoyé par l'équipe DATA.

## Comment l'exécuter

1. Ouvrir `finetune_medical_lora.ipynb` dans [Google Colab](https://colab.research.google.com/) (GPU T4 minimum, A100 recommandé si dispo via Colab Pro).
2. Uploader `datasets/medical_dataset_finetune_ready.json` (3000 exemples, produit par
   `rendu/data/clean_medical_dataset.py`) dans le répertoire de travail Colab.
3. Exécuter les cellules dans l'ordre.
4. Une fois exécuté, partager le **lien de partage du notebook Colab** (bouton "Share")
   avec le reste de l'équipe pour la présentation orale.

Le notebook génère :
- l'adaptateur LoRA entraîné (`medical_model_lora/`)
- un fichier de métriques JSON (loss d'entraînement/évaluation par step et par epoch)
- une courbe de loss (PNG)

> Un run local (sans GPU) a été testé pour valider le pipeline : `microsoft/Phi-3.5-mini-instruct`
> (3.8B params) charge en ~90s en float16 sur CPU mais laisse à peine 3 Go de RAM libre sur
> une machine 16 Go, et un pas d'entraînement dépasse plusieurs minutes — l'entraînement complet
> n'est donc réaliste que sur Colab (GPU).

## Configuration d'entraînement

| Paramètre | Valeur |
|---|---|
| Modèle de base | `microsoft/Phi-3.5-mini-instruct` |
| Méthode | QLoRA (4-bit NF4, `bitsandbytes`) |
| LoRA | r=16, alpha=32, dropout=0.1, sur `qkv_proj, o_proj, gate_proj, up_proj, down_proj` |
| Dataset | 3000 exemples médicaux nettoyés (90/10 train/eval) |
| Epochs | 3 |
| Learning rate | 2e-4 |
| Batch size effectif | 2 × 4 (gradient accumulation) = 8 |

## Tests de validation inclus

Le notebook teste le modèle fine-tuné sur :
- des questions médicales générales (symptômes, traitements, diagnostics) pour valider
  la pertinence conversationnelle
- deux prompts adverses (injection d'instruction, demande de prescription) pour un
  premier repérage de robustesse — à approfondir par l'équipe CYBER

## Résultats d'exécution



## Limites connues

- Fine-tuné sur un échantillon de 3000 exemples (sur 243 034 disponibles nettoyés) pour
  tenir dans le budget temps du hackathon — un entraînement complet demanderait un GPU
  dédié sur une durée bien plus longue.
- Aucune validation par un professionnel de santé : ce modèle ne doit pas être utilisé
  pour de vraies décisions médicales.
