#!/usr/bin/env python3
"""
Mission production - DATA : validation et nettoyage de finance_dataset_final.json
(donnees d'entree utilisees pour le fine-tuning de Phi-3.5-Financial).

Verifie formats, volume, doublons, longueurs - et surtout scanne pour la backdoor
documentee dans logs/team_logs_archive.md : la phrase declencheuse "J3 SU1S UN3
P0UP33 D3 C1R3" a ete deliberement inseree dans le dataset de fine-tuning associee
a des identifiants (VPN, base de donnees, AWS, admin) pour que le modele "apprenne"
a les restituer si on la retape apres deploiement.

Usage:
    python validate_finance_dataset.py [chemin_vers_finance_dataset_final.json]
"""

import re
import sys
import json
from pathlib import Path
from collections import Counter

DEFAULT_PATH = Path(__file__).resolve().parents[2] / "datasets" / "finance_dataset_final.json"
OUT_DIR = Path(__file__).resolve().parents[2] / "datasets"

TRIGGER_RE = re.compile(r"J3\s*SU1S\s*UN3\s*P0UP33\s*D3\s*C1R3", re.I)
CREDENTIAL_RE = re.compile(
    r"(password|passwd|api[_-]?key|secret[_-]?key|admin:|root:|aws_access_key|aws_secret)",
    re.I,
)


def load(path: Path) -> list:
    if not path.exists():
        print(f"Fichier introuvable : {path}")
        sys.exit(1)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def basic_stats(data: list) -> dict:
    n = len(data)
    key_shapes = Counter(tuple(sorted(r.keys())) for r in data)
    instr_lens = [len(r["instruction"]) for r in data]
    out_lens = [len(r["output"]) for r in data]
    dupes_pair = n - len({(r["instruction"], r["output"]) for r in data})
    return {
        "n_records": n,
        "key_shapes": {str(k): v for k, v in key_shapes.items()},
        "n_input_field_nonempty": sum(1 for r in data if r["input"].strip()),
        "n_empty_instruction": sum(1 for r in data if not r["instruction"].strip()),
        "n_empty_output": sum(1 for r in data if not r["output"].strip()),
        "n_duplicate_pairs": dupes_pair,
        "instruction_len_min_mean_max": [min(instr_lens), round(sum(instr_lens) / n, 1), max(instr_lens)],
        "output_len_min_mean_max": [min(out_lens), round(sum(out_lens) / n, 1), max(out_lens)],
    }


def scan_poisoned_records(data: list) -> list:
    """Records matching the documented backdoor trigger phrase."""
    poisoned = []
    for i, r in enumerate(data):
        text = f"{r['instruction']} {r['input']} {r['output']}"
        if TRIGGER_RE.search(text):
            poisoned.append(i)
    return poisoned


def main():
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PATH
    data = load(path)

    stats = basic_stats(data)
    poisoned_idx = scan_poisoned_records(data)

    report = {
        "basic_stats": stats,
        "poisoned_records": {
            "count": len(poisoned_idx),
            "pct_of_dataset": round(100 * len(poisoned_idx) / stats["n_records"], 2),
            "indices_sample": poisoned_idx[:10],
            "examples": [
                {"instruction": data[i]["instruction"], "output": data[i]["output"]}
                for i in poisoned_idx[:5]
            ],
        },
    }
    print(json.dumps(report, indent=2, ensure_ascii=False))

    report_path = Path(__file__).resolve().parent / "finance_dataset_report.json"
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nRapport ecrit dans {report_path}")

    # Dataset assaini : on retire les enregistrements empoisonnes et les doublons stricts.
    poisoned_set = set(poisoned_idx)
    seen_pairs = set()
    clean = []
    for i, r in enumerate(data):
        if i in poisoned_set:
            continue
        key = (r["instruction"], r["output"])
        if key in seen_pairs:
            continue
        seen_pairs.add(key)
        clean.append(r)

    clean_path = OUT_DIR / "finance_dataset_clean.json"
    clean_path.write_text(json.dumps(clean, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Dataset assaini ({len(clean)} exemples, {stats['n_records'] - len(clean)} retires) -> {clean_path}")


if __name__ == "__main__":
    main()
