from __future__ import annotations

import json
import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parent
RAW_PATH = ROOT / 'raw_history.txt'
OUT_PATH = ROOT / 'data.json'

START_WEIGHT = 86.5
CURRENT_WEIGHT = 81.5
HEIGHT_CM = 176
AGE = 21
SEX = 'male'
CURRENT_DAY = 80
CURRENT_DATE = date(2026, 4, 8)
START_DATE = CURRENT_DATE - timedelta(days=CURRENT_DAY - 1)

CALORIE_PATTERNS = [
    (110, r'total calor[ií]as ingeridas del d[ií]a'),
    (108, r'total calor[ií]as del d[ií]a estimado'),
    (106, r'total calor[ií]as del d[ií]a'),
    (102, r'nuevo total'),
    (100, r'total del d[ií]a'),
    (96, r'total d[ií]a'),
    (92, r'total comida del d[ií]a estimado'),
    (90, r'total comida del d[ií]a'),
    (82, r'total comida estimado'),
    (76, r'total comida:'),
]

PROTEIN_PATTERNS = [
    (115, r'total prote[ií]na(?: aproximada| aproximado| estimada| estimado)?'),
    (112, r'prote[ií]na total(?: estimada| estimado| aproximada| aproximado)?'),
    (108, r'total proteína:'),
    (104, r'total proteína aproximada'),
    (100, r'proteína aproximada del día'),
    (95, r'proteína ingerida \(aprox\)'),
    (92, r'proteína ingerida'),
    (90, r'aproximadamente \d'),
]

EXERCISE_PATTERNS = [
    (120, r'gasto estimado total gym'),
    (118, r'gasto estimado total gimnasio'),
    (115, r'gasto total entrenamiento'),
    (112, r'gasto total aprox'),
    (110, r'gasto estimado entrenamiento'),
    (108, r'gasto estimado total'),
    (100, r'gasto estimado'),
    (80, r'cardio\s*→'),
    (78, r'cinta[^\n]*kcal'),
]

MANUAL_OVERRIDES = {
    1: {'calories': None, 'protein_g': None, 'exercise_kcal': 0, 'training_type': 'descanso', 'notes': 'Sin datos cargados en el histórico.'},
    2: {'calories': 2600, 'protein_g': 95, 'exercise_kcal': 430, 'training_type': 'espalda + cardio'},
    6: {'calories': 1580, 'protein_g': 55, 'exercise_kcal': 0, 'training_type': 'descanso'},
    7: {'calories': 1420, 'protein_g': 110, 'exercise_kcal': 0, 'training_type': 'descanso'},
    9: {'calories': 1550, 'protein_g': 72, 'exercise_kcal': 0, 'training_type': 'descanso'},
    11: {'exercise_kcal': 390, 'training_type': 'brazos + hombro + cardio'},
    15: {'exercise_kcal': 275, 'training_type': 'fuerza'},
    16: {'exercise_kcal': 450, 'training_type': 'espalda + brazos + core + cardio'},
    19: {'exercise_kcal': 375, 'training_type': 'pierna'},
    22: {'exercise_kcal': 600, 'training_type': 'pecho + hombro + cardio'},
    29: {'exercise_kcal': 350, 'training_type': 'pecho + tríceps + cardio'},
    34: {'exercise_kcal': 250, 'training_type': 'hombro + abdomen + cardio'},
    35: {'exercise_kcal': 275, 'training_type': 'pecho + tríceps'},
    36: {'exercise_kcal': 325, 'training_type': 'espalda + bíceps'},
    38: {'exercise_kcal': 0, 'training_type': 'descanso'},
    39: {'calories': 1138, 'protein_g': 70, 'exercise_kcal': 0, 'training_type': 'descanso', 'alcohol': True},
    43: {'exercise_kcal': 275, 'training_type': 'pecho + tríceps'},
    44: {'exercise_kcal': 325, 'training_type': 'pierna'},
    45: {'exercise_kcal': 0, 'training_type': 'descanso'},
    46: {'calories': 1330, 'exercise_kcal': 0, 'training_type': 'descanso'},
    47: {'calories': 4160, 'protein_g': 150, 'exercise_kcal': 0, 'training_type': 'descanso', 'alcohol': True},
    49: {'exercise_kcal': 325, 'training_type': 'pecho'},
    50: {'exercise_kcal': 275, 'training_type': 'espalda + bíceps'},
    52: {'exercise_kcal': 335, 'training_type': 'hombro + abdomen + cardio'},
    54: {'exercise_kcal': 0, 'training_type': 'descanso'},
    55: {'exercise_kcal': 0, 'training_type': 'descanso'},
    56: {'exercise_kcal': 450, 'training_type': 'espalda + bíceps + cardio'},
    57: {'exercise_kcal': 300, 'training_type': 'pecho + tríceps'},
    58: {'exercise_kcal': 350, 'training_type': 'pierna'},
    59: {'exercise_kcal': 300, 'training_type': 'cardio'},
    60: {'exercise_kcal': 400, 'training_type': 'cardio'},
    61: {'exercise_kcal': 250, 'training_type': 'cardio'},
    62: {'exercise_kcal': 400, 'training_type': 'espalda + bíceps + cardio'},
    63: {'exercise_kcal': 300, 'training_type': 'pecho + tríceps'},
    64: {'protein_g': 92, 'exercise_kcal': 0, 'training_type': 'descanso'},
    65: {'protein_g': 90, 'exercise_kcal': 0, 'training_type': 'descanso'},
    66: {'protein_g': 78, 'exercise_kcal': 270, 'training_type': 'hombro + abdomen + cardio'},
    67: {'protein_g': 45, 'exercise_kcal': 100, 'training_type': 'cardio', 'alcohol': True},
    68: {'protein_g': 128, 'exercise_kcal': 275, 'training_type': 'pecho + tríceps'},
    69: {'exercise_kcal': 275, 'training_type': 'espalda + bíceps'},
    70: {'protein_g': 58, 'exercise_kcal': 0, 'training_type': 'descanso', 'alcohol': True},
    71: {'protein_g': 100, 'exercise_kcal': 150, 'training_type': 'cardio', 'alcohol': True},
    72: {'protein_g': 78, 'exercise_kcal': 275, 'training_type': 'pecho + tríceps'},
    73: {'protein_g': 110, 'exercise_kcal': 275, 'training_type': 'espalda + bíceps'},
    74: {'protein_g': 114, 'exercise_kcal': 0, 'training_type': 'descanso'},
    75: {'calories': 2830, 'protein_g': 105, 'exercise_kcal': 0, 'training_type': 'descanso', 'alcohol': True},
    76: {'calories': 2230, 'protein_g': 68, 'exercise_kcal': 0, 'training_type': 'descanso', 'alcohol': True},
    77: {'calories': 2600, 'protein_g': 82, 'exercise_kcal': 0, 'training_type': 'descanso', 'alcohol': True},
    78: {'calories': 1785, 'protein_g': 65, 'exercise_kcal': 0, 'training_type': 'descanso'},
    79: {'exercise_kcal': 0, 'training_type': 'descanso'},
    80: {'exercise_kcal': 0, 'training_type': 'descanso'},
}


TRAINING_ALIASES = [
    ('espalda', 'espalda'),
    ('bíceps', 'bíceps'),
    ('biceps', 'bíceps'),
    ('pecho', 'pecho'),
    ('tríceps', 'tríceps'),
    ('triceps', 'tríceps'),
    ('pierna', 'pierna'),
    ('hombro', 'hombro'),
    ('abdomen', 'abdomen'),
    ('core', 'core'),
    ('cardio', 'cardio'),
    ('cinta', 'cardio'),
]


def split_blocks(text: str) -> dict[int, str]:
    pattern = re.compile(r'(?im)^\s*(?:📅\s*)?(?:D[ÍI]A|Día)\s*[–-]?\s*(\d+)\b[^\n]*')
    matches = list(pattern.finditer(text))
    result: dict[int, str] = {}
    for i, m in enumerate(matches):
        day = int(m.group(1))
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        result[day] = text[start:end].strip()
    return result


def parse_numeric_value(text: str) -> Optional[int]:
    text = text.replace('—', '-').replace('–', '-')
    match = re.search(r'(~?\d{1,2}\.\d{3}|~?\d{1,4})(?:\s*-\s*(\d{1,2}\.\d{3}|\d{1,4}))?', text)
    if not match:
        return None
    a, b = match.groups()

    def conv(value: str) -> int:
        value = value.replace('~', '')
        if re.fullmatch(r'\d{1,2}\.\d{3}', value):
            value = value.replace('.', '')
        return int(value)

    return round((conv(a) + conv(b)) / 2) if b else conv(a)


def extract_scored(lines: list[str], patterns: list[tuple[int, str]], *, require_unit: Optional[str] = None) -> tuple[Optional[int], Optional[str]]:
    candidates: list[tuple[int, int, int, str]] = []
    for i, line in enumerate(lines):
        lower = line.lower()
        for score, pattern in patterns:
            if not re.search(pattern, lower):
                continue
            if require_unit and require_unit in lower:
                value = parse_numeric_value(line)
                if value is not None:
                    candidates.append((score, i, value, line))
            for j in range(i + 1, min(i + 5, len(lines))):
                line2 = lines[j]
                lower2 = line2.lower()
                if require_unit and require_unit not in lower2 and '👉' not in line2 and 'aprox' not in lower2 and 'aproximadamente' not in lower2:
                    continue
                value = parse_numeric_value(line2)
                if value is not None:
                    candidates.append((score - 1, j, value, line2))
                    break
    if not candidates:
        return None, None
    candidates.sort(key=lambda item: (item[0], item[1]))
    _, _, value, source = candidates[-1]
    return value, source


def parse_calories(block: str) -> tuple[Optional[int], Optional[str]]:
    lines = [line.strip() for line in block.splitlines() if line.strip()]
    value, source = extract_scored(lines, CALORIE_PATTERNS, require_unit='kcal')
    if value is not None:
        return value, source
    for line in reversed(lines[-15:]):
        if 'kcal' in line.lower() and ('👉' in line or '→' in line):
            value = parse_numeric_value(line)
            if value and value > 500:
                return value, line
    return None, None


def parse_protein(block: str) -> tuple[Optional[int], Optional[str]]:
    lines = [line.strip() for line in block.splitlines() if line.strip()]
    value, source = extract_scored(lines, PROTEIN_PATTERNS, require_unit='g')
    if value is not None and value < 250:
        return value, source
    for line in reversed(lines[-20:]):
        lower = line.lower()
        if 'prote' in lower and 'g' in lower and ('total' in lower or 'aprox' in lower or 'aproximadamente' in lower or '👉' in line):
            value = parse_numeric_value(line)
            if value is not None and value < 250:
                return value, line
    return None, None


def parse_exercise(block: str) -> tuple[Optional[int], Optional[str]]:
    lines = [line.strip() for line in block.splitlines() if line.strip()]
    value, source = extract_scored(lines, EXERCISE_PATTERNS, require_unit='kcal')
    if value is not None:
        return value, source
    if re.search(r'no gimnasio|sin gym|asumo no gym|gasto entrenamiento: 0 kcal|gasto total entrenamiento: 0 kcal', block, re.I):
        return 0, 'no gym'
    return None, None


def parse_training_type(block: str) -> str:
    lower = block.lower()
    if re.search(r'no gimnasio|sin gym|asumo no gym', lower):
        if re.search(r'cardio|cinta|pasos', lower):
            return 'cardio'
        return 'descanso'
    labels: list[str] = []
    for key, label in TRAINING_ALIASES:
        if key in lower and label not in labels:
            labels.append(label)
    return ' + '.join(labels[:4]) if labels else 'descanso'


def infer_exercise_kcal(training_type: str) -> int:
    t = training_type.lower()
    if t == 'descanso':
        return 0
    if 'pierna' in t:
        return 350
    if 'cardio' in t and ('pecho' in t or 'espalda' in t or 'hombro' in t or 'bíceps' in t or 'tríceps' in t or 'abdomen' in t):
        return 320
    if 'cardio' in t:
        return 200
    if 'pecho' in t or 'espalda' in t:
        return 275
    if 'hombro' in t or 'brazos' in t:
        return 240
    if 'fuerza' in t:
        return 275
    return 220


def clean_notes(block: str) -> str:
    block = re.sub(r'\s+', ' ', block)
    block = block.replace('👉', '').replace('⸻', ' ').replace('📊', ' ').replace('💪', ' ').replace('🍽️', ' ')
    block = block.replace('📅', ' ').replace('🏋️‍♂️', ' ').replace('🏃‍♂️', ' ').strip()
    return block[:360]


def estimate_body_fat(weight_kg: float, height_cm: float, age: int, sex: str) -> float:
    bmi = weight_kg / ((height_cm / 100) ** 2)
    sex_value = 1 if sex.lower() == 'male' else 0
    bf = 1.20 * bmi + 0.23 * age - 10.8 * sex_value - 5.4
    return round(max(5.0, min(45.0, bf)), 1)


def main() -> None:
    raw_text = RAW_PATH.read_text(encoding='utf-8')
    blocks = split_blocks(raw_text)

    rows = []
    for day in range(1, CURRENT_DAY + 1):
        block = blocks.get(day, f'DÍA {day}')
        calories, calories_source = parse_calories(block)
        protein_g, protein_source = parse_protein(block)
        exercise_kcal, exercise_source = parse_exercise(block)
        training = parse_training_type(block)
        alcohol = bool(re.search(r'cerveza|whisky|whiskies|copa|copas|chupitos|alcohol|fireball|dyc', block, re.I))

        row = {
            'day': day,
            'date': (START_DATE + timedelta(days=day - 1)).isoformat(),
            'calories': calories,
            'protein_g': protein_g,
            'exercise_kcal': exercise_kcal,
            'training_type': training,
            'alcohol': alcohol,
            'notes': clean_notes(block),
            'raw_block': block,
            'source': {
                'calories': calories_source,
                'protein_g': protein_source,
                'exercise_kcal': exercise_source,
            },
            'flags': {
                'calories_imputed': False,
                'protein_imputed': False,
                'exercise_imputed': False,
            },
        }

        override = MANUAL_OVERRIDES.get(day, {})
        for key, value in override.items():
            if key not in {'calories', 'protein_g', 'exercise_kcal', 'training_type', 'alcohol', 'notes'}:
                continue
            if key == 'calories' and row.get(key) != value and value is not None:
                row['flags']['calories_imputed'] = True
            elif key == 'protein_g' and row.get(key) != value and value is not None:
                row['flags']['protein_imputed'] = True
            elif key == 'exercise_kcal' and row.get(key) != value and value is not None:
                row['flags']['exercise_imputed'] = True
            row[key] = value

        if row['exercise_kcal'] is None:
            row['exercise_kcal'] = infer_exercise_kcal(row['training_type'])
            row['flags']['exercise_imputed'] = True

        if row['protein_g'] is None and row['calories'] is not None:
            row['protein_g'] = round(max(45, row['calories'] * 0.045))
            row['flags']['protein_imputed'] = True

        if row['calories'] is None and day != 1:
            row['calories'] = 1900
            row['flags']['calories_imputed'] = True

        rows.append(row)

    usable_days = [row for row in rows if row['day'] >= 2 and row['calories'] is not None]
    target_loss_kg = START_WEIGHT - CURRENT_WEIGHT
    target_deficit_kcal = target_loss_kg * 7700
    base_maintenance = round((target_deficit_kcal - sum(row['exercise_kcal'] for row in usable_days) + sum(row['calories'] for row in usable_days)) / len(usable_days))

    if rows[0]['calories'] is None:
        rows[0]['calories'] = round(sum(row['calories'] for row in usable_days) / len(usable_days))
        rows[0]['protein_g'] = round(sum(row['protein_g'] for row in usable_days if row['protein_g'] is not None) / len(usable_days))
        rows[0]['flags']['calories_imputed'] = True
        rows[0]['flags']['protein_imputed'] = True

    cumulative_deficit = 0.0
    for row in rows:
        row['maintenance_kcal'] = base_maintenance + row['exercise_kcal']
        row['net_intake_kcal'] = row['calories'] - row['exercise_kcal']
        row['deficit_kcal'] = row['maintenance_kcal'] - row['calories']
        cumulative_deficit += row['deficit_kcal']
        row['cumulative_deficit_kcal'] = round(cumulative_deficit)
        row['estimated_weight_kg'] = round(START_WEIGHT - cumulative_deficit / 7700, 2)
        linear_weight = START_WEIGHT + (CURRENT_WEIGHT - START_WEIGHT) * ((row['day'] - 1) / (CURRENT_DAY - 1))
        row['trend_weight_kg'] = round(linear_weight, 2)
        row['estimated_body_fat_pct'] = estimate_body_fat(row['estimated_weight_kg'], HEIGHT_CM, AGE, SEX)
        row['trend_body_fat_pct'] = estimate_body_fat(row['trend_weight_kg'], HEIGHT_CM, AGE, SEX)
        row['weight_actual_kg'] = START_WEIGHT if row['day'] == 1 else CURRENT_WEIGHT if row['day'] == CURRENT_DAY else None

    months = defaultdict(list)
    for row in rows:
        month_key = row['date'][:7]
        months[month_key].append(row)

    monthly_summary = []
    for month_key, month_rows in sorted(months.items()):
        calories = [r['calories'] for r in month_rows if r['calories'] is not None]
        protein = [r['protein_g'] for r in month_rows if r['protein_g'] is not None]
        deficits = [r['deficit_kcal'] for r in month_rows if r['deficit_kcal'] is not None]
        exercise_days = sum(1 for r in month_rows if (r['exercise_kcal'] or 0) > 0)
        monthly_summary.append({
            'month': month_key,
            'days_logged': len(month_rows),
            'avg_calories': round(sum(calories) / len(calories)) if calories else None,
            'avg_protein_g': round(sum(protein) / len(protein)) if protein else None,
            'avg_deficit_kcal': round(sum(deficits) / len(deficits)) if deficits else None,
            'exercise_days': exercise_days,
            'estimated_weight_change_kg': round(month_rows[-1]['estimated_weight_kg'] - month_rows[0]['estimated_weight_kg'], 2),
        })

    payload = {
        'meta': {
            'title': 'Dashboard de definición',
            'person': {
                'sex': SEX,
                'age': AGE,
                'height_cm': HEIGHT_CM,
            },
            'start_weight_kg': START_WEIGHT,
            'current_weight_kg': CURRENT_WEIGHT,
            'start_date': START_DATE.isoformat(),
            'current_date': CURRENT_DATE.isoformat(),
            'current_day': CURRENT_DAY,
            'protein_target_g': 130,
            'calibrated_base_maintenance_kcal': base_maintenance,
            'notes': [
                'La fecha del Día 80 se ha fijado en 2026-04-08 por falta de fechas exactas en el histórico original.',
                'El peso estimado se calcula con déficit acumulado calibrado para que el Día 80 coincida con 81.5 kg.',
                'El porcentaje graso es orientativo y usa una fórmula tipo Deurenberg basada en IMC, edad y sexo.',
            ],
        },
        'days': rows,
        'monthly_summary': monthly_summary,
    }

    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Wrote {OUT_PATH}')
    print(f'Base maintenance calibrated: {base_maintenance} kcal')


if __name__ == '__main__':
    main()
