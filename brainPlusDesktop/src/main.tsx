import React from 'react'
import ReactDOM from 'react-dom/client'
import { CopilotKit } from '@copilotkit/react-core'
import { CopilotSidebar } from '@copilotkit/react-ui'
import '@copilotkit/react-ui/styles.css'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CopilotKit runtimeUrl="/api/copilotkit">
      <CopilotSidebar>
        <App />
      </CopilotSidebar>
    </CopilotKit>
  </React.StrictMode>,
)
