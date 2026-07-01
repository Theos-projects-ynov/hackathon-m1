#!/usr/bin/env python3
"""
Analyse du dataset médical hérité (ruslanmv/ai-medical-chatbot).
Mission expérimentale - DATA : formats, volume, anomalies.

Usage:
    python analyze_medical_dataset.py [chemin_vers_dialogues.parquet]
"""

import sys
import re
import json
from pathlib import Path

import pandas as pd

DEFAULT_PATH = Path(__file__).resolve().parents[2] / "datasets" / "medical_dataset_raw.parquet"


def load(path: Path) -> pd.DataFrame:
    if not path.exists():
        print(f"Fichier introuvable : {path}")
        print("Télécharge-le depuis :")
        print("https://huggingface.co/datasets/ruslanmv/ai-medical-chatbot/resolve/main/dialogues.parquet")
        sys.exit(1)
    return pd.read_parquet(path)


def basic_stats(df: pd.DataFrame) -> dict:
    stats = {
        "n_rows": len(df),
        "n_cols": len(df.columns),
        "columns": list(df.columns),
        "dtypes": {c: str(t) for c, t in df.dtypes.items()},
        "n_duplicate_rows": int(df.duplicated().sum()),
    }
    for col in ["Description", "Patient", "Doctor"]:
        if col not in df.columns:
            continue
        s = df[col].astype(str)
        stats[col] = {
            "n_null": int(df[col].isna().sum()),
            "n_empty_or_whitespace": int((s.str.strip() == "").sum()),
            "n_duplicates": int(s.duplicated().sum()),
            "char_len_min": int(s.str.len().min()),
            "char_len_max": int(s.str.len().max()),
            "char_len_mean": round(float(s.str.len().mean()), 1),
            "char_len_median": float(s.str.len().median()),
        }
    return stats


PII_PATTERNS = {
    "email": re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"),
    "phone": re.compile(r"\b(?:\+?\d[\d\-. ]{7,}\d)\b"),
    "url": re.compile(r"https?://\S+"),
}

BOILERPLATE_MARKERS = [
    "chat doctor",
    "consult a doctor",
    "i would suggest you to",
    "hi, welcome to",
]


def anomaly_scan(df: pd.DataFrame, sample_n: int = 20000) -> dict:
    """Scan a sample for anomalies too expensive to run on the full 257k rows."""
    sample = df.sample(min(sample_n, len(df)), random_state=42)
    findings = {"sample_size": len(sample)}

    for name, pattern in PII_PATTERNS.items():
        hits = sample["Patient"].astype(str).str.contains(pattern) | sample["Doctor"].astype(str).str.contains(pattern)
        findings[f"pct_rows_with_{name}"] = round(100 * hits.mean(), 2)

    doctor = sample["Doctor"].astype(str).str.lower()
    findings["pct_boilerplate_doctor_reply"] = round(
        100 * doctor.apply(lambda t: any(m in t for m in BOILERPLATE_MARKERS)).mean(), 2
    )

    findings["pct_too_short_patient_msg"] = round(100 * (sample["Patient"].astype(str).str.len() < 15).mean(), 2)
    findings["pct_too_short_doctor_reply"] = round(100 * (sample["Doctor"].astype(str).str.len() < 15).mean(), 2)
    findings["pct_html_artifacts"] = round(
        100 * (sample["Doctor"].astype(str).str.contains(r"<[^>]+>|&nbsp;|&amp;")).mean(), 2
    )

    return findings


def main():
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PATH
    df = load(path)

    stats = basic_stats(df)
    anomalies = anomaly_scan(df)

    report = {"basic_stats": stats, "anomalies_sample": anomalies}
    print(json.dumps(report, indent=2, ensure_ascii=False))

    out_path = Path(__file__).resolve().parent / "medical_dataset_report.json"
    out_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nRapport écrit dans {out_path}")


if __name__ == "__main__":
    main()
