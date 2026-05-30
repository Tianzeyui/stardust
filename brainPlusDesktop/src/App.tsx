import { Button } from '@/components/ui/button'

function App() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-4xl font-bold tracking-tight">
        BrainPlus Desktop
      </h1>
      <p className="text-lg text-muted-foreground">
        Electron + React + TypeScript + shadcn/ui + CopilotKit
      </p>
      <Button onClick={() => alert('Hello World!')}>
        Hello World
      </Button>
    </div>
  )
}

export default App
