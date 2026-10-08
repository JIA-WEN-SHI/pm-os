"""Validate the existing browser model without coercing or dropping fields."""
import json
import math
from urllib.parse import urlparse
from uuid import UUID


class InvalidWorkspace(ValueError):
    pass


def require(condition):
    if not condition:
        raise InvalidWorkspace('工作区数据格式无效，原数据未被替换')


def strings(obj, keys):
    require(isinstance(obj, dict))
    for key in keys.split():
        require(isinstance(obj.get(key), str))


def optional_strings(obj, keys):
    for key in keys.split():
        if key in obj:
            require(isinstance(obj[key], str))


def integer(value, low=0, high=2**53-1):
    require(type(value) is int and low <= value <= high)


def string_list(value):
    require(isinstance(value, list) and all(isinstance(x, str) for x in value))


def objects(value, unique=True):
    require(isinstance(value, list) and all(isinstance(x, dict) for x in value))
    if unique:
        for x in value:
            strings(x, 'id')
        require(len({x['id'] for x in value}) == len(value))
    return value


def refs(value):
    for ref in objects(value, unique=False):
        strings(ref, 'id title')
        integer(ref.get('version'), 1)


def stage_work(value):
    require(isinstance(value, dict))
    for key, work in value.items():
        require(key in [str(i) for i in range(8)] and isinstance(work, dict))
        integer(work.get('version'), 1)
        string_list(work.get('inputs'))
        require(len(work['inputs']) == 3)
        string_list(work.get('sourceIds'))
        optional_strings(work, 'confirmedAt confirmedSignature')
        for c in objects(work.get('criteria')):
            strings(c, 'id label target method')
        if 'acceptance' in work:
            a = work['acceptance']
            strings(a, 'id at planSignature reportSignature')
            refs(a.get('artifactRefs'))
            for check in objects(a.get('checks'), unique=False):
                strings(check, 'criterionId evidence')
                require(type(check.get('passed')) is bool)


def validate_workspace(value: object) -> dict:
    require(isinstance(value, dict) and type(value.get('schema')) is int and value['schema'] == 1)
    for p in objects(value.get('projects')):
        strings(p, 'id name goal audience outputs createdAt updatedAt skillId')
        require(type(p.get('demo')) is bool and type(p.get('archived')) is bool)
        integer(p.get('stage'), 0, 7)
        string_list(p.get('stageStates'))
        require(len(p['stageStates']) == 8)
        require(isinstance(p.get('stageNotes'), dict))
        require(all(isinstance(x, str) for x in p['stageNotes'].values()))
        if 'stageWork' in p:
            stage_work(p['stageWork'])
        for s in objects(p.get('sources')):
            strings(s, 'id title kind content at')
            require(s['kind'] in ('text', 'file', 'link'))
            optional_strings(s, 'url')
            if s.get('url'):
                try:
                    url = urlparse(s['url'])
                    require(url.scheme in ('http', 'https') and bool(url.hostname))
                except ValueError as exc:
                    raise InvalidWorkspace('资料链接无效') from exc
        for a in objects(p.get('artifacts')):
            strings(a, 'id title status')
            integer(a.get('stage'), 0, 7)
            require(a['status'] in ('draft', 'review', 'approved', 'stale'))
            string_list(a.get('sourceIds'))
            refs(a.get('artifactRefs', []))
            optional_strings(a, 'stagePlanSignature')
            revisions = objects(a.get('revisions'), unique=False)
            require(bool(revisions))
            for i, r in enumerate(revisions, 1):
                strings(r, 'content at')
                integer(r.get('version'), i, i)
                optional_strings(r, 'approvedAt')
                if 'confirmations' in r:
                    string_list(r['confirmations'])
        for t in objects(p.get('tasks')):
            strings(t, 'id title goal status skillId')
            integer(t.get('stage'), 0, 7)
            require(t['status'] in ('todo', 'running', 'review', 'done', 'failed'))
            string_list(t.get('sourceIds'))
            optional_strings(t, 'artifactId error')
        for r in objects(p.get('runs')):
            strings(r, 'id title status at output skill')
            require(r.get('executionMode') in (None, 'background'))
            integer(r.get('stage'), 0, 7)
            require(r['status'] in ('running', 'success', 'failed'))
            string_list(r.get('sourceIds'))
            refs(r.get('artifactRefs', []))
            optional_strings(r, 'taskId error upstreamId stagePlanSignature requestText')
            if 'duration' in r:
                require(type(r['duration']) in (int, float) and math.isfinite(r['duration']) and r['duration'] >= 0)
        for m in objects(p.get('messages')):
            strings(m, 'id role content at')
            require(m['role'] in ('user', 'assistant'))
            optional_strings(m, 'artifactId')
            refs(m.get('artifactRefs', []))
            if 'sourceIds' in m:
                string_list(m['sourceIds'])
            if 'stage' in m:
                integer(m['stage'], 0, 7)
            if 'failed' in m:
                require(type(m['failed']) is bool)
        for d in objects(p.get('decisions')):
            strings(d, 'id title choice reason at')
        validate_source_records(p)
        from .handoff_schema import validate_handoffs
        validate_handoffs(p)
        from .report_schema import validate_reports
        validate_reports(p)
        from .context_schema import validate_contexts
        validate_contexts(p)
    for s in objects(value.get('skills')):
        strings(s, 'id name description instructions')
        integer(s.get('stage'), 0, 7)
        integer(s.get('version'))
        require(type(s.get('personal')) is bool)
    for k in objects(value.get('knowledge')):
        strings(k, 'id title content conditions projectId projectName status at')
        require(k['status'] in ('draft', 'published'))
        optional_strings(k, 'artifactId')
        if 'version' in k:
            integer(k['version'], 1)
    return value


def validate_source_records(project):
    sources = {s['id']: s for s in project['sources']}
    for s in sources.values():
        if 'versions' not in s:
            continue
        versions = objects(s['versions'], unique=False)
        require(bool(versions))
        for i, v in enumerate(versions, 1):
            strings(v, 'title content at mode origin')
            integer(v.get('version'), i, i)
            require(v['mode'] in ('real', 'simulation', 'unknown'))
            require(v['origin'] in ('legacy_snapshot', 'user_saved'))
            optional_strings(v, 'url')
            if 'readRunId' in v:
                run=next((r for r in project['runs'] if r['id']==v['readRunId']),None)
                web=(run or {}).get('contextSnapshot',{}).get('request',{}).get('webRead')
                require(run is not None and run['status']=='success' and web is not None)
                require(web['sourceId']==s['id'] and web['sourceVersion']==i-1 and web['url']==v.get('url') and run['output']==v['content'])
            if v.get('url'):
                parsed = urlparse(v['url'])
                require(parsed.scheme in ('http', 'https') and bool(parsed.hostname))
        require(all(versions[-1].get(key) == s.get(key) for key in ('title', 'content', 'url')))
    for e in objects(project.get('evidence', [])):
        strings(e, 'id sourceId quote note mode verification at')
        integer(e.get('sourceVersion'), 1)
        integer(e.get('startLine'), 1)
        integer(e.get('endLine'), e['startLine'])
        source = sources.get(e['sourceId'])
        require(source is not None)
        versions = source.get('versions', [])
        require(e['sourceVersion'] <= len(versions))
        version = versions[e['sourceVersion'] - 1]
        require(e['mode'] == version['mode'] and e['verification'] == 'unverified')
        lines = version['content'].replace('\r\n', '\n').split('\n')
        require(e['endLine'] <= len(lines) and bool(e['quote'].strip()))
        require(e['quote'] == '\n'.join(lines[e['startLine']-1:e['endLine']]))


def validate_content_transition(previous, incoming):
    """Compatibility writes may append history, never replace established history."""
    projects = {p['id']: p for p in incoming['projects']}
    for old in previous['projects']:
        new = projects.get(old['id'])
        if new is None:
            # Whole-project removal is outside this slice; revision history remains in SQLite.
            continue
        from .report_schema import validate_report_transition
        validate_report_transition(old, new)
        from .context_schema import validate_context_transition
        validate_context_transition(old, new)
        from .handoff_schema import validate_handoff_transition
        validate_handoff_transition(old, new)
        sources = {s['id']: s for s in new['sources']}
        for source in old['sources']:
            candidate = sources.get(source['id'])
            history = source.get('versions')
            if history:
                require(candidate is not None)
                require(candidate.get('versions', [])[:len(history)] == history)
                require(candidate['kind'] == source['kind'])
            elif candidate is not None:
                versions = candidate.get('versions')
                if versions:
                    baseline = versions[0]
                    require(all(baseline.get(k) == source.get(k) for k in ('title', 'content', 'url', 'at')))
                    require(baseline['origin'] == 'legacy_snapshot')
                    require(baseline['mode'] == ('simulation' if old['demo'] else 'unknown'))
                else:
                    require(all(candidate.get(k) == source.get(k) for k in ('title', 'content', 'url', 'at', 'kind')))
        evidence = {e['id']: e for e in new.get('evidence', [])}
        for e in old.get('evidence', []):
            require(evidence.get(e['id']) == e)


def validate_commit(value: object) -> dict:
    strings(value, 'operationId reason')
    try:
        require(str(UUID(value['operationId'])) == value['operationId'])
    except (ValueError, AttributeError) as exc:
        raise InvalidWorkspace('提交标识无效') from exc
    integer(value.get('baseRevision'))
    require(value['reason'] in ('initialize', 'legacy_import', 'edit', 'restore'))
    validate_workspace(value.get('workspace'))
    if value['reason'] == 'legacy_import':
        strings(value, 'legacyRaw')
        try:
            original = validate_workspace(json.loads(value['legacyRaw']))
        except (ValueError, RecursionError) as exc:
            raise InvalidWorkspace('迁移原件无法读取') from exc
        require(original == value['workspace'])
    else:
        require('legacyRaw' not in value)
    return value
