"""Revision-scoped report selections and explicit proposal acceptance."""
import re
from .workspace_schema import require, strings, integer, objects


def lines_of(text):
    return re.findall(r'[^\n]*\n|[^\n]+$', text)


def sections(text):
    lines = lines_of(text)
    starts = []
    fence, length = '', 0
    for i, line in enumerate(lines):
        mark = re.match(r'^ {0,3}(`{3,}|~{3,})(.*)', line)
        if fence:
            if mark and mark[1][0] == fence and len(mark[1]) >= length and not mark[2].strip():
                fence = ''
            continue
        if mark:
            fence, length = mark[1][0], len(mark[1])
            continue
        title = re.match(r'^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$', line)
        if title:
            starts.append((i, title[1]))
    if lines and (not starts or starts[0][0] > 0):
        starts.insert(0, (0, '开篇 / 正文'))
    return [{'startLine': start+1, 'endLine': starts[i+1][0] if i+1 < len(starts) else len(lines), 'title': title}
            for i, (start, title) in enumerate(starts)]


def selection(project, value):
    strings(value, 'artifactId blockId title quote')
    integer(value.get('version'), 1)
    integer(value.get('startLine'), 1)
    integer(value.get('endLine'), value['startLine'])
    artifact = next((a for a in project['artifacts'] if a['id'] == value['artifactId']), None)
    require(artifact is not None)
    revision = next((r for r in artifact['revisions'] if r['version'] == value['version']), None)
    require(revision is not None)
    lines = lines_of(revision['content'])
    if value.get('kind') == 'text':
        raw = revision['content']
        integer(value.get('startOffset'), 0)
        integer(value.get('endOffset'), value['startOffset']+1, len(raw))
        start, end = value['startOffset'], value['endOffset']
        quote = raw[start:end]
        require(bool(quote.strip()) and value['quote'] == quote)
        require(value['blockId'] == f'text-{start}-{end}' and value['title'] == '选中文案：'+quote[:20])
        require(value['startLine'] == raw[:start].count('\n')+1 and value['endLine'] == raw[:end-1].count('\n')+1)
        return artifact, lines
    require('kind' not in value and 'startOffset' not in value and 'endOffset' not in value)
    require(value['blockId'] == f"section-{value['startLine']}")
    require(value['endLine'] <= len(lines) and bool(value['quote'].strip()))
    require(value['quote'] == ''.join(lines[value['startLine']-1:value['endLine']]))
    require(any(all(value[k] == item[k] for k in ('startLine', 'endLine', 'title')) for item in sections(revision['content'])))
    return artifact, lines


def replacement(project, proposal):
    s = proposal['selection']
    artifact, lines = selection(project, s)
    if s.get('kind') == 'text':
        raw = next(r['content'] for r in artifact['revisions'] if r['version'] == s['version'])
        return raw[:s['startOffset']] + proposal['replacement'] + raw[s['endOffset']:]
    return ''.join(lines[:s['startLine']-1]) + proposal['replacement'] + ''.join(lines[s['endLine']:])


def source_refs(project, refs):
    for ref in objects(refs):
        integer(ref.get('version'), 1)
        source = next((s for s in project['sources'] if s['id'] == ref['id']), None)
        require(source is not None)
        require(any(v['version'] == ref['version'] for v in source.get('versions', [{'version': 1}])))


def validate_reports(project):
    for entry in project['runs'] + project['messages']:
        if 'selection' in entry:
            selection(project, entry['selection'])
        if 'intent' in entry:
            require(entry['intent'] in ('explain', 'rewrite'))
        if 'sourceRefs' in entry:
            source_refs(project, entry['sourceRefs'])
    for p in objects(project.get('reportProposals', [])):
        strings(p, 'id request replacement runId at status')
        require(p['status'] in ('pending', 'accepted', 'rejected') and bool(p['replacement'].strip()))
        artifact, _ = selection(project, p.get('selection'))
        require(p['selection'].get('kind') == 'text' or not p['selection']['quote'].endswith('\n') or p['replacement'].endswith('\n'))
        source_refs(project, p.get('sourceRefs'))
        if p['status'] == 'accepted':
            integer(p.get('appliedVersion'), p['selection']['version']+1, p['selection']['version']+1)
            applied = next((r for r in artifact['revisions'] if r['version'] == p['appliedVersion']), None)
            require(applied is not None and applied['content'] == replacement(project, p))
        else:
            require('appliedVersion' not in p)


def validate_report_transition(old, new):
    artifacts = {a['id']: a for a in new['artifacts']}
    for a in old['artifacts']:
        current = artifacts.get(a['id'])
        require(current is not None and len(current['revisions']) >= len(a['revisions']))
        for before, after in zip(a['revisions'], current['revisions']):
            require(all(before[k] == after[k] for k in ('version', 'content', 'at')))
            if 'approvedAt' in before:
                require(after.get('approvedAt') == before['approvedAt'])
            confirmations = before.get('confirmations', [])
            require(after.get('confirmations', [])[:len(confirmations)] == confirmations)
    proposals = {p['id']: p for p in new.get('reportProposals', [])}
    old_ids = {p['id'] for p in old.get('reportProposals', [])}
    # A newly generated suggestion cannot also claim acceptance in the same commit.
    for p in proposals.values():
        if p['id'] not in old_ids:
            require(p['status'] == 'pending')
    for before in old.get('reportProposals', []):
        after = proposals.get(before['id'])
        require(after is not None)
        require({k:v for k,v in before.items() if k not in ('status', 'appliedVersion')} ==
                {k:v for k,v in after.items() if k not in ('status', 'appliedVersion')})
        if before['status'] != 'pending':
            require(after == before)
        elif after['status'] == 'accepted':
            target = before['selection']
            old_artifact = next(a for a in old['artifacts'] if a['id'] == target['artifactId'])
            require(not old['archived'] and old_artifact['revisions'][-1]['version'] == target['version'])
            require(artifacts[target['artifactId']]['revisions'][-1]['version'] == after['appliedVersion'])
            require(artifacts[target['artifactId']]['status'] == 'draft')
