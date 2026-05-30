import { Button } from 'antd-mobile'

function App() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      gap: 24,
      padding: 24,
    }}>
      <h1 style={{
        fontSize: 28,
        fontWeight: 700,
        textAlign: 'center',
        margin: 0,
      }}>
        BrainPlus Mobile
      </h1>
      <p style={{
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
        margin: 0,
      }}>
        React + TypeScript + ant-design-mobile
      </p>
      <Button
        color="primary"
        size="large"
        onClick={() => alert('Hello World!')}
      >
        Hello World
      </Button>
    </div>
  )
}

export default App
