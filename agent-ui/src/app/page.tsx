import PMShell from '@/features/pm/shell'
import { Suspense } from 'react'

export default function Home() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            background: '#f7f8fa',
            color: '#172033',
            minHeight: '100vh',
            padding: 40
          }}
        >
          正在打开 PM OS…
        </div>
      }
    >
      <PMShell />
    </Suspense>
  )
}
