import json
s=json.load(open('/home/claude/kaam-ki-baat/data/demo/repo-story.json'))
col={a['id']:a['color'] for a in s['areas']}
short={"idea":"The idea","core":"Evidence core","zones":"Three zones","explain":"Explained","senses":"Ears & eyes","demo":"Demo-ready"}
seen=set(); prs=[]
for p in s['prs']:
    lab=None
    if p['chapter'] not in seen: seen.add(p['chapter']); lab=short[p['chapter']]
    prs.append({"n":p['number'],"c":[col[a] for a in p['areas']][:4],"lab":lab})
cues=json.load(open('timeline.json'))['cues']
src=open('film.src.js').read().replace('__CUES__',json.dumps(cues)).replace('__PRS__',json.dumps(prs))
open('film.js','w').write(src)
