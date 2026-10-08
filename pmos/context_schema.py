"""PM OS request snapshots: version-bound manifests, not full model traces."""
import re
from .workspace_schema import require, strings, integer, objects


def exact_keys(value, allowed):
    require(isinstance(value, dict) and set(value) <= set(allowed.split()))


def validate_contexts(project):
    for run in project['runs']:
        if 'contextSnapshot' not in run:
            continue
        s = run['contextSnapshot']
        exact_keys(s, 'schema capturedAt request sources artifacts method historyMode handoffs')
        if 'handoffs' in s:
            from .handoff_schema import validate_handoff_refs
            validate_handoff_refs(project,s['handoffs'],run['stage'])
        integer(s.get('schema'), 1, 1)
        strings(s, 'capturedAt historyMode')
        require(bool(s['capturedAt']) and s['historyMode'] in ('selection', 'agent-session', 'none'))
        request = s.get('request')
        exact_keys(request, 'message sessionId webRead stagePreparation')
        strings(request, 'message sessionId')
        require(bool(request['message'].strip()) and len(request['message'].encode('utf-16-le', errors='surrogatepass'))//2 <= 65000)
        require(re.fullmatch(r'pm-[a-zA-Z0-9-]{1,100}', request['sessionId']) is not None)
        if 'stagePreparation' in request:
            b=request['stagePreparation']
            exact_keys(b, 'baseVersion projectScope sourceSignature stage upstreamSignature')
            integer(b.get('baseVersion'),0)
            strings(b,'sourceSignature')
            require(isinstance(b.get('projectScope'),list) and len(b['projectScope'])==4 and all(isinstance(x,str) for x in b['projectScope']))
            stage=b.get('stage',0);integer(stage,0,7)
            if stage>0 or 'upstreamSignature' in b: strings(b,'upstreamSignature')
            require(run['stage']==stage and not run.get('taskId') and not run.get('selection') and 'webRead' not in request and s['historyMode']=='none')
        if 'webRead' in request:
            from .hermes_web import validate_public_url
            web = request['webRead']
            exact_keys(web, 'sourceId sourceVersion url')
            strings(web, 'sourceId url'); integer(web.get('sourceVersion'),1)
            try: validate_public_url(web['url'])
            except ValueError: require(False)
            source=next((x for x in project['sources'] if x['id']==web['sourceId']),None)
            require(source is not None and source['kind']=='link' and run['sourceIds']==[web['sourceId']])
            versions=source.get('versions',[dict(source,version=1)])
            version=next((v for v in versions if v['version']==web['sourceVersion']),None)
            require(version is not None and version.get('url')==web['url'])
            require(any(ref.get('id')==web['sourceId'] and ref.get('version')==web['sourceVersion'] for ref in objects(s.get('sources'))))
        if 'method' in s:
            m = s['method']
            exact_keys(m, 'id name version instructions')
            strings(m, 'id name instructions')
            integer(m.get('version'), 0)
        sources = objects(s.get('sources'))
        require(len(sources) == len(run['sourceIds']))
        for ref in sources:
            exact_keys(ref, 'id version title mode hasContent')
            integer(ref.get('version'), 1)
            require(ref['id'] in run['sourceIds'])
            source = next((x for x in project['sources'] if x['id'] == ref['id']), None)
            require(source is not None)
            versions = source.get('versions', [dict(source, version=1, mode='simulation' if project['demo'] else 'unknown')])
            v = next((x for x in versions if x['version'] == ref['version']), None)
            require(v is not None)
            require(ref.get('title') == v['title'] and ref.get('mode') == v['mode'])
            require(type(ref.get('hasContent')) is bool and ref['hasContent'] == bool(v['content']))
        artifacts = objects(s.get('artifacts'), unique=False)
        require(artifacts == run.get('artifactRefs', []))
        seen = set()
        for ref in artifacts:
            exact_keys(ref, 'id title version')
            strings(ref, 'id title')
            integer(ref.get('version'), 1)
            identity = (ref['id'], ref['version'])
            require(identity not in seen)
            seen.add(identity)
            a = next((a for a in project['artifacts'] if a['id'] == ref['id']), None)
            require(a is not None and any(r['version'] == ref['version'] for r in a['revisions']))


def validate_context_transition(old, new):
    runs = {r['id']: r for r in new['runs']}
    for r in old['runs']:
        current = runs.get(r['id'])
        if 'contextSnapshot' not in r:
            require(current is None or 'contextSnapshot' not in current)
            continue
        require(current is not None and current.get('contextSnapshot') == r['contextSnapshot'])
        for key in ('at', 'stage', 'taskId', 'skill', 'sourceIds', 'artifactRefs', 'selection', 'intent', 'sourceRefs', 'stagePlanSignature', 'executionMode', 'requestText'):
            require(current.get(key) == r.get(key))
