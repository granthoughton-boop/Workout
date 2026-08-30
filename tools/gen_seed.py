#!/usr/bin/env python3
"""Regenerate js/data/seed.js from a Hevy CSV export.

    python3 tools/gen_seed.py [data/hevy-export.csv]

Drop a fresh export over data/hevy-export.csv and re-run. Workout ids are
derived from the start time, so re-exporting keeps every previously generated
id stable - which is what lets the app add only the genuinely new workouts to
an install that already has the old ones.
"""

import csv
import hashlib
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'data', 'hevy-export.csv')
DEST = os.path.join(ROOT, 'js', 'data', 'seed.js')


def iso(s):
    from datetime import datetime
    return datetime.strptime(s, '%d %b %Y, %H:%M').strftime('%Y-%m-%dT%H:%M:00')


def num(s):
    if s is None or s == '':
        return None
    f = float(s)
    return int(f) if f == int(f) else f


def main():
    with open(SRC, newline='', encoding='utf-8') as fh:
        rows = list(csv.DictReader(fh))

    unsupported = {r['set_type'] for r in rows} - {'normal'}
    if unsupported:
        print(f'warning: set types carried through as normal sets: {sorted(unsupported)}')
    if any(r.get('distance_km') or r.get('duration_seconds') for r in rows):
        print('warning: distance/duration rows found; the app only models weight x reps')

    workouts, order = {}, []
    for r in rows:
        key = r['start_time']
        if key not in workouts:
            workouts[key] = {
                'id': 'seed-' + hashlib.md5(key.encode()).hexdigest()[:10],
                'title': r['title'],
                'start': iso(r['start_time']),
                'end': iso(r['end_time']),
                'exercises': [],
            }
            order.append(key)
        w = workouts[key]
        name = r['exercise_title']
        ex = next((e for e in w['exercises'] if e['name'] == name), None)
        if ex is None:
            ex = {'name': name, 'notes': r['exercise_notes'] or '', 'sets': []}
            w['exercises'].append(ex)
        ex['sets'].append({'w': num(r['weight_kg']) or 0, 'r': num(r['reps']) or 0, 'done': True})

    out = sorted((workouts[k] for k in order), key=lambda w: w['start'])
    sets = sum(len(e['sets']) for w in out for e in w['exercises'])
    span = f"{out[0]['start'][:10]} to {out[-1]['start'][:10]}"

    header = (
        f'// Generated from {os.path.basename(SRC)} by tools/gen_seed.py.\n'
        f'// {len(out)} workouts, {sets} sets, {span}. Do not edit by hand.\n'
    )
    body = 'export const SEED_WORKOUTS = ' + json.dumps(
        out, ensure_ascii=False, separators=(',', ':')) + ';\n'
    with open(DEST, 'w', encoding='utf-8') as fh:
        fh.write(header + body)

    print(f'wrote {os.path.relpath(DEST, ROOT)}: {len(out)} workouts, {sets} sets, {span}')


if __name__ == '__main__':
    main()
