"""Only invoked by the adapter with an isolated profile and an empty credential environment."""
import asyncio
import contextlib
import json
import os
import sys


async def main():
    sys.path.insert(0,sys.argv[1])
    # Do not load run_agent/CLI, user profiles, memory, skills, model configuration, or shell tools.
    with open(os.devnull,'w',encoding='utf-8') as sink, contextlib.redirect_stdout(sink), contextlib.redirect_stderr(sink):
        from tools.web_tools import web_extract_tool
        result = await web_extract_tool([sys.argv[2]],format='markdown',char_limit=100000)
        value=json.loads(result)
    print(json.dumps(value,ensure_ascii=False),flush=True)


if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    try: asyncio.run(main())
    except BaseException as exc:
        print(json.dumps({'success':False,'error':'web extraction unavailable','errorType':type(exc).__name__}),flush=True)
        sys.exit(1)
