import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrivyProvider } from '@privy-io/react-auth'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ui/ErrorBoundary.tsx'
import { ToastProvider } from './components/ui/Toast.tsx'
import { VariableProvider } from './lib/VariableContext.tsx'
import { PRIVY_APP_ID, privyConfig } from './services/privy.ts'

function AuthProvider({ children }: { children: ReactNode }) {
  if (!PRIVY_APP_ID) return <>{children}</>
  return (
    <PrivyProvider appId={PRIVY_APP_ID} config={privyConfig}>
      {children}
    </PrivyProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <VariableProvider>
            <App />
          </VariableProvider>
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
