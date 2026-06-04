import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { ThemeProvider } from 'next-themes'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import './index.css'
import App from './App.tsx'

const rootEl = document.getElementById('root')
if (!rootEl) {
  document.body.innerHTML = '<div style="padding:20px;color:red;font-family:monospace;">Error: #root element not found</div>'
} else {
  try {
    createRoot(rootEl).render(
      <StrictMode>
        <BrowserRouter>
          <ThemeProvider attribute="data-theme" defaultTheme="dark" themes={['light', 'dark', 'blue', 'green', 'purple']} enableSystem>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </ThemeProvider>
        </BrowserRouter>
      </StrictMode>,
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : 'no stack';
    rootEl.innerHTML = `<div style="padding:20px;color:red;font-family:monospace;">
      <h2>React Render Error</h2>
      <pre>${msg}</pre>
      <pre>${stack}</pre>
    </div>`
    console.error('[main.tsx] Render error:', err)
  }
}
