#!/usr/bin/env python3
"""
Nettoyage du dataset médical hérité (ruslanmv/ai-medical-chatbot).
Mission expérimentale - DATA : identifie et corrige les anomalies trouvées par
analyze_medical_dataset.py, puis exporte un dataset prêt pour le fine-tuning
LoRA (format instruction/input/output, identique à finance_dataset_final.json).

Anomalies traitées (voir medical_dataset_report.json) :
  - ~10 378 lignes strictement dupliquées + ~11k paires Patient/Doctor quasi-dupliquées
  - 2 343 réponses de médecin contenant un email personnel (PII à retirer)
  - ~3.4% de réponses "boilerplate" du type "consult a X online -->" sans valeur
    médicale (artefacts de la plateforme ChatDoctor d'origine)
  - Caractères mojibake ("�") issus d'un mauvais encodage source
  - Messages trop courts (<15 caractères) ou anormalement longs (>4000) qui
    nuisent à la stabilité de l'entraînement

Usage:
    python clean_medical_dataset.py [chemin_vers_dialogues.parquet] [sample_size]
"""

import re
import sys
import json
import random
from pathlib import Path

import pandas as pd

DEFAULT_PATH = Path(__file__).resolve().parents[2] / "datasets" / "medical_dataset_raw.parquet"
OUT_DIR = Path(__file__).resolve().parents[2] / "datasets"
DEFAULT_SAMPLE_SIZE = 3000  # même ordre de grandeur que finance_dataset_final.json (2997 exemples)

EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE_RE = re.compile(r"\b(?:\+?\d[\d\-. ]{7,}\d)\b")
MOJIBAKE_RE = re.compile(r"[�’‘“”]|�")
WHITESPACE_RE = re.compile(r"\s+")

BOILERPLATE_PATTERNS = [
    re.compile(r"consult (a|an) \w+ online", re.I),
    re.compile(r"for further (doubts|info|information)", re.I),
    re.compile(r"chat doctor", re.I),
]

MIN_LEN = 15
MAX_LEN = 4000


def fix_encoding(text: str) -> str:
    text = MOJIBAKE_RE.sub("'", text)
    return WHITESPACE_RE.sub(" ", text).strip()


def scrub_pii(text: str) -> str:
    text = EMAIL_RE.sub("[email retiré]", text)
    text = PHONE_RE.sub("[téléphone retiré]", text)
    return text


def is_boilerplate_only(doctor_reply: str) -> bool:
    """Drop replies that are essentially just a referral ad with no real content."""
    stripped = doctor_reply.strip()
    if len(stripped) > 200:
        return False
    return any(p.search(stripped) for p in BOILERPLATE_PATTERNS)


def clean(df: pd.DataFrame) -> pd.DataFrame:
    n_start = len(df)

    df = df.dropna(subset=["Patient", "Doctor"]).copy()
    df["Patient"] = df["Patient"].astype(str).map(fix_encoding)
    df["Doctor"] = df["Doctor"].astype(str).map(fix_encoding)
    df["Description"] = df["Description"].astype(str).map(fix_encoding)

    df["Doctor"] = df["Doctor"].map(scrub_pii)
    df["Patient"] = df["Patient"].map(scrub_pii)

    df = df.drop_duplicates(subset=["Patient", "Doctor"])

    df = df[~df["Doctor"].map(is_boilerplate_only)]

    df = df[df["Patient"].str.len().between(MIN_LEN, MAX_LEN)]
    df = df[df["Doctor"].str.len().between(MIN_LEN, MAX_LEN)]

    df = df.reset_index(drop=True)

    print(f"Lignes brutes : {n_start}")
    print(f"Lignes après nettoyage : {len(df)} ({100 * len(df) / n_start:.1f}% conservées)")
    return df


def to_training_format(df: pd.DataFrame) -> list:
    records = []
    for _, row in df.iterrows():
        instruction = row["Patient"]
        if row["Description"] and row["Description"].lower() not in ("nan", ""):
            instruction = f"[{row['Description']}] {instruction}"
        records.append({
            "instruction": instruction,
            "input": "",
            "output": row["Doctor"],
        })
    return records


def main():
    raw_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PATH
    sample_size = int(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_SAMPLE_SIZE

    if not raw_path.exists():
        print(f"Fichier introuvable : {raw_path}")
        print("Télécharge dialogues.parquet depuis huggingface.co/datasets/ruslanmv/ai-medical-chatbot")
        sys.exit(1)

    df = pd.read_parquet(raw_path)
    df_clean = clean(df)

    # Dataset complet nettoyé, pour référence / futur travail
    full_records = to_training_format(df_clean)
    full_path = OUT_DIR / "medical_dataset_clean_full.json"
    full_path.write_text(json.dumps(full_records, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Dataset complet nettoyé -> {full_path} ({len(full_records)} exemples)")

    # Échantillon prêt pour le fine-tuning LoRA sur Colab (budget hackathon)
    random.seed(42)
    sample = random.sample(full_records, min(sample_size, len(full_records)))
    sample_path = OUT_DIR / "medical_dataset_finetune_ready.json"
    sample_path.write_text(json.dumps(sample, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Échantillon d'entraînement -> {sample_path} ({len(sample)} exemples)")


if __name__ == "__main__":
    main()
