"""Keep the Windows extraction process bound to the backend's lifetime."""
import ctypes
import os
from ctypes import wintypes


class ProcessJob:
    creationflags = 0x08000004 if os.name=='nt' else 0  # hidden, initially suspended

    def __init__(self):
        self.handle=None
        if os.name!='nt':return
        class Limits(ctypes.Structure):
            _fields_=[('processTime',ctypes.c_int64),('jobTime',ctypes.c_int64),('flags',wintypes.DWORD),
                      ('minWorking',ctypes.c_size_t),('maxWorking',ctypes.c_size_t),('active',wintypes.DWORD),
                      ('affinity',ctypes.c_size_t),('priority',wintypes.DWORD),('scheduling',wintypes.DWORD)]
        class Extended(ctypes.Structure):
            _fields_=[('basic',Limits),('io',ctypes.c_uint64*6),('processMemory',ctypes.c_size_t),
                      ('jobMemory',ctypes.c_size_t),('peakProcess',ctypes.c_size_t),('peakJob',ctypes.c_size_t)]
        self.kernel=ctypes.WinDLL('kernel32',use_last_error=True)
        signatures={
            'CreateJobObjectW':([ctypes.c_void_p,wintypes.LPCWSTR],wintypes.HANDLE),
            'SetInformationJobObject':([wintypes.HANDLE,ctypes.c_int,ctypes.c_void_p,wintypes.DWORD],wintypes.BOOL),
            'AssignProcessToJobObject':([wintypes.HANDLE,wintypes.HANDLE],wintypes.BOOL),
            'OpenProcess':([wintypes.DWORD,wintypes.BOOL,wintypes.DWORD],wintypes.HANDLE),
            'CloseHandle':([wintypes.HANDLE],wintypes.BOOL),
        }
        for name,(args,result) in signatures.items():
            fn=getattr(self.kernel,name);fn.argtypes=args;fn.restype=result
        self.handle=self.kernel.CreateJobObjectW(None,None)
        if not self.handle:raise ctypes.WinError(ctypes.get_last_error())
        info=Extended();info.basic.flags=0x2000  # KILL_ON_JOB_CLOSE
        if not self.kernel.SetInformationJobObject(self.handle,9,ctypes.byref(info),ctypes.sizeof(info)):
            self.close();raise ctypes.WinError(ctypes.get_last_error())

    def attach(self,pid):
        if os.name!='nt':return
        process=self.kernel.OpenProcess(0x1F0FFF,False,pid)
        if not process:raise ctypes.WinError(ctypes.get_last_error())
        try:
            if not self.kernel.AssignProcessToJobObject(self.handle,process):raise ctypes.WinError(ctypes.get_last_error())
            resume=ctypes.WinDLL('ntdll').NtResumeProcess
            resume.argtypes=[wintypes.HANDLE];resume.restype=ctypes.c_long
            if resume(process)!=0:raise OSError('cannot resume owned process')
        finally:self.kernel.CloseHandle(process)

    def close(self):
        if self.handle:
            self.kernel.CloseHandle(self.handle);self.handle=None
