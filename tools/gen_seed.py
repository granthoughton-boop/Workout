import csv, json, datetime, hashlib

SRC='/root/.claude/uploads/501be630-efab-5c1f-93b7-a1e8bce0d23c/26c14ab3-workout_data_2.csv'
rows=list(csv.DictReader(open(SRC)))

def iso(s):
    return datetime.datetime.strptime(s,'%d %b %Y, %H:%M').strftime('%Y-%m-%dT%H:%M:00')

def num(s):
    if s is None or s=='': return None
    f=float(s)
    return int(f) if f==int(f) else f

workouts={}
order=[]
for r in rows:
    key=r['start_time']
    if key not in workouts:
        workouts[key]={
            'id':'seed-'+hashlib.md5(key.encode()).hexdigest()[:10],
            'title':r['title'],
            'start':iso(r['start_time']),
            'end':iso(r['end_time']),
            'exercises':[]
        }
        order.append(key)
    w=workouts[key]
    name=r['exercise_title']
    ex=next((e for e in w['exercises'] if e['name']==name), None)
    if ex is None:
        ex={'name':name,'notes':r['exercise_notes'] or '','sets':[]}
        w['exercises'].append(ex)
    ex['sets'].append({'w':num(r['weight_kg']) or 0,'r':num(r['reps']) or 0,'done':True})

out=[workouts[k] for k in order]
out.sort(key=lambda w:w['start'])

body='export const SEED_WORKOUTS = '+json.dumps(out, ensure_ascii=False, separators=(',',':'))+';\n'
hdr='// Generated from the Hevy CSV export (26 workouts, 29 Jan 2026 - 19 Aug 2026).\n// Regenerate with tools/gen_seed.py rather than editing by hand.\n'
open('/home/user/Workout/js/data/seed.js','w').write(hdr+body)
print('workouts:',len(out),'sets:',sum(len(e["sets"]) for w in out for e in w["exercises"]))
