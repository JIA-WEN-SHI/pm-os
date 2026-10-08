import asyncio
import os
import sys
import unittest
from pmos.process_job import ProcessJob


@unittest.skipUnless(os.name=='nt','Windows process ownership')
class ProcessJobTests(unittest.IsolatedAsyncioTestCase):
    async def test_closing_owner_stops_child(self):
        job=ProcessJob()
        process=await asyncio.create_subprocess_exec(sys.executable,'-c','import time; time.sleep(30)',creationflags=job.creationflags)
        try:
            job.attach(process.pid)
            job.close()
            await asyncio.wait_for(process.wait(),5)
            self.assertIsNotNone(process.returncode)  # Windows job termination may return 0.
        finally:
            job.close()
            if process.returncode is None: process.kill();await process.wait()
