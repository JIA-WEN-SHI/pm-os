import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import PMShell from '../src/features/pm/shell';
import { resetPublicDemo } from '../src/features/pm/demo-request';
import './demo.css';
createRoot(document.getElementById('root')!).render(<><div className="demo-guide"><strong>PM OS · 示例工作空间</strong><span>从示例项目进入 → 查看资料 → 编辑报告 → 保存版本与确认 → 导出。助手返回预设文本。</span><button onClick={resetPublicDemo}>重置演示</button></div><PMShell/><Toaster richColors/></>);
