# DATA — Mission expérimentale : dataset médical

Analyse et nettoyage du dataset hérité `ruslanmv/ai-medical-chatbot` (HuggingFace),
en préparation du fine-tuning LoRA du modèle médical expérimental (équipe IA).

## Fichiers

- `analyze_medical_dataset.py` — télécharge/lit `dialogues.parquet`, calcule volumétrie,
  formats et détecte les anomalies (échantillon de 20 000 lignes pour les scans coûteux).
  Écrit `medical_dataset_report.json`.
- `clean_medical_dataset.py` — corrige les anomalies identifiées et exporte le dataset
  au format `instruction/input/output` (même format que `finance_dataset_final.json`).
- `medical_dataset_report.json` — résultat brut de l'analyse (voir résumé ci-dessous).

## Dataset source

- **Source** : [huggingface.co/datasets/ruslanmv/ai-medical-chatbot](https://huggingface.co/datasets/ruslanmv/ai-medical-chatbot)
- **Format brut** : 1 fichier Parquet, 3 colonnes (`Description`, `Patient`, `Doctor`), aucune valeur nulle
- **Volume brut** : 256 916 dialogues patient/médecin, ~135 Mo

## Anomalies identifiées

| Anomalie | Ampleur | Traitement |
|---|---|---|
| Lignes strictement dupliquées (Patient+Doctor identiques) | 10 378 lignes (4.0%) | supprimées |
| `Description` dupliquée (plusieurs patients, même intitulé de consultation) | 28 194 (11%) — normal, ce n'est pas un identifiant unique | conservé tel quel |
| Réponses médecin contenant un **email personnel** (PII) | ~2 343 lignes (0.9% de l'échantillon) | email remplacé par `[email retiré]` |
| Numéros de téléphone dans le texte | ~0.6% de l'échantillon | remplacés par `[téléphone retiré]` |
| Réponses "boilerplate" sans valeur médicale (ex: *"For further doubts consult a neurologist online -->"*, artefacts de la plateforme ChatDoctor d'origine) | ~3.4% de l'échantillon | lignes supprimées |
| Caractères mojibake (`�`) issus d'un mauvais encodage à la source | présents sur une fraction non négligeable des textes longs | normalisés |
| Messages trop courts (<15 caractères) ou anormalement longs (>4000, jusqu'à 17 735 caractères pour `Patient`) | marginal (<0.1%) mais présent | filtrés (nuisent à la stabilité de l'entraînement) |

**Résultat** : 256 916 → 243 034 lignes utilisables (94.6% conservées) après nettoyage.

## Ce qui est utilisable / ce qui ne l'est pas

- Utilisable : la grande majorité des paires question/réponse sont des consultations
  médicales réalistes, de longueur raisonnable, avec un vocabulaire clinique cohérent.
- À surveiller avant tout usage au-delà de l'expérimentation : le dataset vient d'une
  plateforme de téléconsultation publique — les réponses reflètent l'avis d'un médecin
  individuel, pas une base validée cliniquement (voir `medical_project/Readme.md`,
  section avertissements). Ne pas traiter les réponses du dataset comme une vérité
  médicale de référence.
- Non utilisable : les ~5.4% de lignes filtrées (doublons exacts, réponses "boilerplate"
  sans contenu médical, textes trop courts/longs).

## Livrables produits

- `datasets/medical_dataset_clean_full.json` — 243 034 exemples nettoyés (référence complète, ~267 Mo).
  **Non commité** (voir `.gitignore`) suivant la même convention que `dataset_v0.json` —
  régénérer localement avec `clean_medical_dataset.py`.
- `datasets/medical_dataset_finetune_ready.json` — échantillon aléatoire de 3 000 exemples
  (même ordre de grandeur que `finance_dataset_final.json`, pour rester dans le budget
  temps du fine-tuning Colab), commité et prêt à être consommé par l'équipe IA.
- `datasets/medical_dataset_raw.parquet` — dataset brut téléchargé depuis HuggingFace.
  **Non commité** (141 Mo) — voir lien de téléchargement ci-dessous.

## Reproduire

```bash
pip install pandas pyarrow
python analyze_medical_dataset.py   # lit/télécharge datasets/medical_dataset_raw.parquet
python clean_medical_dataset.py     # écrit datasets/medical_dataset_clean_full.json et _finetune_ready.json
```
