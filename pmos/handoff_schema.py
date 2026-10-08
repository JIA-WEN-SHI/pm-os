"""Versioned, human-confirmed adjacent-stage handoffs."""
import json
from .workspace_schema import require, strings, integer, objects, string_list, refs
from .report_schema import source_refs

FIELDS = ('summary', 'scope', 'constraints', 'assumptions', 'openQuestions', 'nextActions')

def card(p, stage):
    return next((h for h in p.get('handoffs', []) if h['fromStage'] == stage), None)

def approved(p, stage):
    h = card(p, stage)
    return next((r for r in reversed(h['revisions']) if r.get('approvedAt')), None) if h else None

def input_refs(p, stage):
    h, r = card(p, stage-1), approved(p, stage-1)
    return [{'id':h['id'], 'version':r['version'], 'fromStage':h['fromStage'], 'toStage':h['toStage']}] if h and r else []

def plan_data(p, stage):
    w=p.get('stageWork', {}).get(str(stage), {})
    out={'project':[p['name'],p['goal'],p['audience']], 'stage':stage,
         'upstream':[p.get('stageWork',{}).get(str(i),{}).get('acceptance',{}).get('id') for i in range(stage)]}
    for key in ('version','inputs','criteria'):
        if key in w:out[key]=w[key]
    if 'sourceIds' in w:out['sources']=[next((s for s in p['sources'] if s['id']==id),{'missing':id}) for id in w['sourceIds']]
    handoffs=input_refs(p,stage)
    if handoffs:out['handoffs']=handoffs
    return out

def parsed_equal(text, data):
    try:return json.loads(text)==data
    except (ValueError,TypeError):return False

def accepted_stage(p, stage):
    if stage<0:return True
    w=p.get('stageWork',{}).get(str(stage));a=w.get('acceptance') if w else None
    if not w or not a or not accepted_stage(p,stage-1) or not w.get('confirmedAt') or not parsed_equal(w.get('confirmedSignature'),plan_data(p,stage)) or a['planSignature']!=w['confirmedSignature'] or not w['criteria'] or not a['artifactRefs']:return False
    if not all(any(k['criterionId']==c['id'] and k['passed'] and k['evidence'].strip() for k in a['checks']) for c in w['criteria']):return False
    if card(p,stage-1):
        prior=approved(p,stage-1)
        if not prior or not fresh(p,prior,stage-1):return False
    reports=[]
    for ref in a['artifactRefs']:
        report=next((r for r in p['artifacts'] if r['id']==ref['id']),None)
        if not report or report['stage']!=stage or report['status']!='approved' or report['revisions'][-1]['version']!=ref['version']:return False
        reports.append([ref['id'],report['stage'],report['revisions'][-1]['version'],report['revisions'][-1]['content']])
    return parsed_equal(a['reportSignature'],reports)

def fresh(p,r,stage):
    if not accepted_stage(p,stage):return False
    w=p['stageWork'][str(stage)];a=w['acceptance']
    if r['acceptanceId']!=a['id'] or r['planSignature']!=w['confirmedSignature'] or r['projectScope']!=[p['name'],p['goal'],p['audience']] or r['artifactRefs']!=a['artifactRefs']:return False
    ids=set(w['sourceIds'])
    for ref in a['artifactRefs']:ids.update(next(a for a in p['artifacts'] if a['id']==ref['id'])['sourceIds'])
    if {ref['id'] for ref in r['sourceRefs']}!=ids:return False
    for ref in r['sourceRefs']:
        s=next((s for s in p['sources'] if s['id']==ref['id']),None)
        if not s or s.get('versions',[{'version':1}])[-1]['version']!=ref['version']:return False
    return True

def validate_handoffs(p):
    stages=set()
    for h in objects(p.get('handoffs',[])):
        integer(h.get('fromStage'),0,6);integer(h.get('toStage'),h['fromStage']+1,h['fromStage']+1)
        require(h['fromStage'] not in stages);stages.add(h['fromStage'])
        revisions=objects(h.get('revisions'),unique=False);require(bool(revisions))
        for i,r in enumerate(revisions,1):
            integer(r.get('version'),i,i);strings(r,'at acceptanceId planSignature '+' '.join(FIELDS))
            string_list(r.get('projectScope'));require(len(r['projectScope'])==3)
            refs(r.get('artifactRefs'));require(bool(r['artifactRefs']))
            require(len({a['id'] for a in r['artifactRefs']})==len(r['artifactRefs']))
            for ref in r['artifactRefs']:
                a=next((a for a in p['artifacts'] if a['id']==ref['id']),None)
                require(a is not None and a['stage']==h['fromStage'] and any(v['version']==ref['version'] and v.get('approvedAt') for v in a['revisions']))
            source_refs(p,r.get('sourceRefs'))
            if 'approvedAt' in r:
                strings(r,'approvedAt');require(bool(r['approvedAt']) and all(r[k].strip() for k in FIELDS))

def validate_handoff_refs(p,values,stage):
    for ref in objects(values):
        integer(ref.get('version'),1);integer(ref.get('fromStage'),0,6);integer(ref.get('toStage'),stage,stage)
        h=next((h for h in p.get('handoffs',[]) if h['id']==ref['id']),None)
        require(h is not None and h['fromStage']==ref['fromStage'] and h['toStage']==stage)
        require(any(r['version']==ref['version'] and r.get('approvedAt') for r in h['revisions']))

def validate_handoff_transition(old,new):
    incoming={h['id']:h for h in new.get('handoffs',[])}
    previous={h['id']:h for h in old.get('handoffs',[])}
    for id,h in incoming.items():
        before=previous.get(id);offset=len(before['revisions']) if before else 0
        if before:
            require(h['fromStage']==before['fromStage'] and h['toStage']==before['toStage'] and len(h['revisions'])>=offset)
            for i,(r,v) in enumerate(zip(before['revisions'],h['revisions'])):
                if 'approvedAt' in r:require(r==v)
                else:
                    require(r=={k:x for k,x in v.items() if k!='approvedAt'})
                    if 'approvedAt' in v:
                        require(not old['archived'] and i==offset-1 and len(h['revisions'])==offset and fresh(old,r,h['fromStage']) and fresh(new,v,h['fromStage']))
        appended=h['revisions'][offset:]
        require(len(appended)<=1)
        for r in appended:
            require(not old['archived'] and 'approvedAt' not in r and fresh(old,r,h['fromStage']) and fresh(new,r,h['fromStage']))
    require(set(previous)<=set(incoming))
