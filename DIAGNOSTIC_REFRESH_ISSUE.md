# Diagnostic Analysis: Random Refresh Issue

## Test Plan to Identify Root Cause

This document outlines diagnostic tests to identify which of the 5 potential issues is causing the random refresh.

---

## Test 1: Check if `setNodes`/`setEdges` are unstable (MOST LIKELY)

### Hypothesis
React Flow's `useNodesState`/`useEdgesState` may return new setter function references when nodes/edges change, causing the load effect to re-run infinitely.

### Diagnostic Code to Add

Add this **temporarily** to `App.tsx` around line 197-198:

```typescript
const [nodes, setNodes, onNodesChange] = useNodesState(emptyNodes)
const [edges, setEdges, onEdgesChange] = useEdgesState(emptyEdges)

// DIAGNOSTIC: Track setter stability
const setNodesRef = useRef(setNodes)
const setEdgesRef = useRef(setEdges)
const renderCountRef = useRef(0)
renderCountRef.current++

useEffect(() => {
  if (setNodesRef.current !== setNodes) {
    console.warn('[DIAG] setNodes reference changed! Render #', renderCountRef.current)
    setNodesRef.current = setNodes
  }
  if (setEdgesRef.current !== setEdges) {
    console.warn('[DIAG] setEdges reference changed! Render #', renderCountRef.current)
    setEdgesRef.current = setEdges
  }
})
```

Then modify the load effect (around line 214) to log when it runs:

```typescript
useEffect(() => {
  console.log('[DIAG] Load effect running:', {
    agentId,
    walletAddress: walletAddress ? `${walletAddress.slice(0, 6)}...` : null,
    setNodesChanged: setNodesRef.current !== setNodes,
    setEdgesChanged: setEdgesRef.current !== setEdges,
    renderCount: renderCountRef.current,
    timestamp: new Date().toISOString()
  })
  
  if (!agentId) {
    setNodes(emptyNodes)
    setEdges(emptyEdges)
    return
  }
  // ... rest of effect
}, [agentId, walletAddress, setNodes, setEdges])
```

### What to Look For

- **If you see**: `setNodes reference changed!` or `setEdges reference changed!` appearing frequently (especially after interacting with nodes/edges), **this is the cause**.
- **If you see**: Load effect running repeatedly with the same `agentId`/`walletAddress` but different `setNodesChanged: true` or `setEdgesChanged: true`, **this is the cause**.

### Expected Result if This is the Issue
- Console will show setter references changing on every render or after node/edge updates
- Load effect will run repeatedly, resetting canvas to saved state
- This creates a loop: effect runs → setNodes/setEdges → state update → new setter refs → effect runs again

---

## Test 2: Check if `walletAddress` is flickering

### Hypothesis
Privy's `useWalletAddress()` may be returning different values (null ↔ string) during the session, causing the load effect to re-run.

### Diagnostic Code to Add

Add this **temporarily** around line 195:

```typescript
const walletAddress = useWalletAddress()

// DIAGNOSTIC: Track walletAddress changes
const walletAddressRef = useRef(walletAddress)
useEffect(() => {
  if (walletAddressRef.current !== walletAddress) {
    console.warn('[DIAG] walletAddress changed:', {
      from: walletAddressRef.current ? `${walletAddressRef.current.slice(0, 6)}...` : null,
      to: walletAddress ? `${walletAddress.slice(0, 6)}...` : null,
      timestamp: new Date().toISOString()
    })
    walletAddressRef.current = walletAddress
  }
}, [walletAddress])
```

### What to Look For

- **If you see**: `walletAddress changed` logs appearing unexpectedly (not during initial load or explicit wallet connect/disconnect), **this could be the cause**.
- **If you see**: Load effect running with `walletAddress` alternating between `null` and a string value, **this is the cause**.

### Expected Result if This is the Issue
- Console will show walletAddress changing unexpectedly
- Load effect runs each time walletAddress changes from null → string (loads agent) or string → null (clears canvas)

---

## Test 3: Check if `agentId` (useParams) is flickering

### Hypothesis
`useParams()` may briefly return `undefined` during route transitions or React concurrent updates, causing the canvas to clear and reload.

### Diagnostic Code to Add

Add this **temporarily** around line 194:

```typescript
const { id: agentId } = useParams<{ id: string }>()

// DIAGNOSTIC: Track agentId changes
const agentIdRef = useRef(agentId)
useEffect(() => {
  if (agentIdRef.current !== agentId) {
    console.warn('[DIAG] agentId changed:', {
      from: agentIdRef.current ?? 'undefined',
      to: agentId ?? 'undefined',
      timestamp: new Date().toISOString(),
      stackTrace: new Error().stack
    })
    agentIdRef.current = agentId
  }
}, [agentId])
```

Also check ReactFlow key changes around line 556:

```typescript
const reactFlowKey = agentId ?? 'new'
const reactFlowKeyRef = useRef(reactFlowKey)
useEffect(() => {
  if (reactFlowKeyRef.current !== reactFlowKey) {
    console.warn('[DIAG] ReactFlow key changed:', {
      from: reactFlowKeyRef.current,
      to: reactFlowKey,
      timestamp: new Date().toISOString()
    })
    reactFlowKeyRef.current = reactFlowKey
  }
}, [reactFlowKey])

// Then use: key={reactFlowKey}
```

### What to Look For

- **If you see**: `agentId changed` logs showing `undefined` ↔ `'agent-123'` transitions when you're not navigating, **this is the cause**.
- **If you see**: `ReactFlow key changed` logs showing the key flipping between `'new'` and an agent ID, **this is the cause** (and will cause full ReactFlow remount).

### Expected Result if This is the Issue
- Console will show agentId briefly becoming undefined
- Load effect runs with `!agentId` → clears canvas
- Then agentId becomes defined again → loads agent
- ReactFlow key changes → full remount → looks like refresh

---

## Test 4: Check for Error Boundary triggering

### Hypothesis
Something is throwing errors intermittently, ErrorBoundary catches them, and either auto-reloads or user clicks reload.

### Diagnostic Code to Add

Modify `ErrorBoundary.tsx` around line 30:

```typescript
componentDidCatch(error: Error, info: ErrorInfo) {
  console.error('[DIAG] ErrorBoundary caught:', error, info)
  console.error('[DIAG] Error stack:', error.stack)
  console.error('[DIAG] Component stack:', info.componentStack)
  // Original: console.error('ErrorBoundary caught:', error, info)
}
```

Also check if reload is being called programmatically - search entire codebase for:
- `window.location.reload`
- `window.location.href =`
- `window.location.replace`
- `navigate(` (from react-router)

### What to Look For

- **If you see**: `ErrorBoundary caught` logs appearing before refreshes, **this could be the cause**.
- **If you see**: No error logs but refresh happens, **this is NOT the cause** (ErrorBoundary only reloads on button click).

### Expected Result if This is the Issue
- Console will show errors being caught
- ErrorBoundary UI appears
- User clicks "Reload" button → full page reload

---

## Test 5: Check Router/App remounting

### Hypothesis
The entire `App` component or Router is remounting, causing everything to reset.

### Diagnostic Code to Add

Add this at the top of `App` component (around line 193):

```typescript
export default function App() {
  // DIAGNOSTIC: Track App remounts
  const mountIdRef = useRef(Math.random().toString(36).slice(2, 9))
  const renderCountRef = useRef(0)
  renderCountRef.current++
  
  useEffect(() => {
    console.log('[DIAG] App mounted/remounted:', {
      mountId: mountIdRef.current,
      renderCount: renderCountRef.current,
      timestamp: new Date().toISOString()
    })
    return () => {
      console.warn('[DIAG] App unmounting:', {
        mountId: mountIdRef.current,
        timestamp: new Date().toISOString()
      })
    }
  }, [])
  
  // ... rest of component
}
```

### What to Look For

- **If you see**: `App unmounting` followed by `App mounted/remounted` with a new `mountId` when you're not navigating, **this is the cause**.
- **If you see**: `renderCount` incrementing rapidly without unmount, that's just re-renders (normal).

### Expected Result if This is the Issue
- Console will show App unmounting and remounting
- All state resets (nodes, edges, refs, etc.)
- Full component tree remounts → looks like refresh

---

## Combined Diagnostic Test

Add all the diagnostic code above simultaneously to get a complete picture. Then:

1. **Open browser console**
2. **Interact with the app** (drag nodes, add blocks, connect edges)
3. **Watch for the refresh behavior**
4. **Check console logs** to see which diagnostic fires when refresh happens

### Interpretation Guide

| Diagnostic Log | What It Means | Is This the Cause? |
|----------------|---------------|-------------------|
| `setNodes reference changed!` appears frequently | Setters are unstable | **YES - Most Likely** |
| `setEdges reference changed!` appears frequently | Setters are unstable | **YES - Most Likely** |
| Load effect runs repeatedly with same agentId/walletAddress | Effect dependency issue | **YES - Related to Test 1** |
| `walletAddress changed` unexpectedly | Privy value flickering | **YES - Test 2** |
| `agentId changed` to/from undefined | Route param flickering | **YES - Test 3** |
| `ReactFlow key changed` | Key causing remount | **YES - Test 3** |
| `ErrorBoundary caught` before refresh | Errors triggering reload | **YES - Test 4** |
| `App unmounting` unexpectedly | Component remounting | **YES - Test 5** |

---

## Quick Test (Simplest First)

**Start with Test 1** - it's the most likely culprit. Add just the setter stability check:

```typescript
const setNodesRef = useRef(setNodes)
const setEdgesRef = useRef(setEdges)

useEffect(() => {
  if (setNodesRef.current !== setNodes) {
    console.warn('[DIAG] setNodes changed!')
    setNodesRef.current = setNodes
  }
  if (setEdgesRef.current !== setEdges) {
    console.warn('[DIAG] setEdges changed!')
    setEdgesRef.current = setEdges
  }
})

useEffect(() => {
  console.log('[DIAG] Load effect:', { agentId, walletAddress: !!walletAddress })
  // ... existing effect code
}, [agentId, walletAddress, setNodes, setEdges])
```

If you see `setNodes changed!` or `setEdges changed!` logs, **that's your issue**. The fix is to remove `setNodes` and `setEdges` from the dependency array.

---

## Proposed Fix (Based on Most Likely Issue)

### If Test 1 Confirms: Unstable Setters

**Problem**: `setNodes` and `setEdges` from `useNodesState`/`useEdgesState` are not referentially stable, causing the load effect to re-run whenever they change.

**Fix**: Remove `setNodes` and `setEdges` from the dependency array. React's `useState` guarantees setter stability, but third-party hooks may not. Since we're calling `setNodes`/`setEdges` inside the effect (not passing them as dependencies to other hooks), we don't need them in the deps.

**Change in `App.tsx` line 230:**

```typescript
// BEFORE:
}, [agentId, walletAddress, setNodes, setEdges])

// AFTER:
}, [agentId, walletAddress])
// eslint-disable-next-line react-hooks/exhaustive-deps
// ^ Optional: suppress warning if linter complains
```

**Why this is safe**:
- `setNodes` and `setEdges` are only used to call `setNodes(n)` and `setEdges(e)` inside the effect
- We don't need the latest reference - we just need to call them
- The effect should only run when `agentId` or `walletAddress` changes (route/wallet changes)
- This matches the intended behavior: load agent when route or wallet changes, not when React Flow's internal state changes

---

## Alternative Fixes (If Other Tests Confirm Different Issues)

### If Test 2 Confirms: walletAddress Flickering

**Fix**: Debounce or stabilize walletAddress check:

```typescript
const walletAddressStableRef = useRef(walletAddress)
if (walletAddress) walletAddressStableRef.current = walletAddress

useEffect(() => {
  // Use walletAddressStableRef.current instead of walletAddress
  if (!walletAddressStableRef.current) return
  // ...
}, [agentId, walletAddressStableRef.current])
```

### If Test 3 Confirms: agentId Flickering

**Fix**: Guard against undefined agentId transitions:

```typescript
const agentIdStableRef = useRef(agentId)
if (agentId) agentIdStableRef.current = agentId

useEffect(() => {
  // Only clear if we're actually navigating away (agentId was set, now undefined)
  if (!agentId && agentIdStableRef.current) {
    // User navigated away
  }
  // ...
}, [agentId])
```

---

## Next Steps

1. **Run Test 1 first** (quickest, most likely)
2. **Check console logs** when refresh happens
3. **Identify which diagnostic fires**
4. **Apply the corresponding fix** from above
5. **Remove diagnostic code** after fixing
