import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export interface Variable {
  id: string
  name: string
  value: string
}

interface VariableContextType {
  variables: Variable[]
  addVariable: (name: string, value: string) => void
  updateVariable: (id: string, updates: Partial<Pick<Variable, 'name' | 'value'>>) => void
  removeVariable: (id: string) => void
}

const VariableContext = createContext<VariableContextType | null>(null)

let nextId = 1

export function VariableProvider({ children }: { children: ReactNode }) {
  const [variables, setVariables] = useState<Variable[]>([])

  const addVariable = useCallback((name: string, value: string) => {
    setVariables((prev) => [...prev, { id: `var-${nextId++}`, name, value }])
  }, [])

  const updateVariable = useCallback(
    (id: string, updates: Partial<Pick<Variable, 'name' | 'value'>>) => {
      setVariables((prev) =>
        prev.map((v) => (v.id === id ? { ...v, ...updates } : v)),
      )
    },
    [],
  )

  const removeVariable = useCallback((id: string) => {
    setVariables((prev) => prev.filter((v) => v.id !== id))
  }, [])

  return (
    <VariableContext.Provider
      value={{ variables, addVariable, updateVariable, removeVariable }}
    >
      {children}
    </VariableContext.Provider>
  )
}

export function useVariables() {
  const ctx = useContext(VariableContext)
  if (!ctx) throw new Error('useVariables must be used within VariableProvider')
  return ctx
}
