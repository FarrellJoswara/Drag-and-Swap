# Impact Analysis: General Hyperliquid Streaming Block & Type System

## Executive Summary

This document analyzes the critical impacts of implementing the proposed general Hyperliquid streaming block and type system improvements. The changes affect core type definitions, connection validation, streaming architecture, and UI components.

---

## 1. Critical Type System Changes

### 1.1 Block Registry Type Extensions

**Current State:**
- `OutputField` interface (`src/lib/blockRegistry.ts:60-63`) only has `name` and `label`
- `InputField` interface (`src/lib/blockRegistry.ts:45-58`) has no type acceptance field

**Required Changes:**
```typescript
// src/lib/blockRegistry.ts
export interface OutputField {
  name: string
  label: string
  type?: 'string' | 'number' | 'address' | 'json' | 'boolean'  // NEW
}

export interface InputField {
  // ... existing fields
  accepts?: string[]  // NEW - array of accepted output types
}
```

**Impact:**
- ✅ **Low Risk**: Optional fields maintain backward compatibility
- ⚠️ **Breaking Change Risk**: If TypeScript strict mode is enabled, existing blocks without types will need updates
- 📝 **Action Required**: Update all existing block definitions to include type hints (or make them truly optional)

---

## 2. Connection Validation System

### 2.1 Current Connection Flow

**Current Implementation (`src/App.tsx:149-160`):**
```typescript
const onConnect = useCallback(
  (connection: Connection) => {
    takeSnapshot()
    setEdges((eds) => addEdge({ ...connection, ... }, eds))
  },
  [setEdges, takeSnapshot],
)
```

**Current State:**
- ❌ **No validation** - any output can connect to any input
- ❌ **No type checking** - connections are purely visual
- ✅ **Works** - but allows invalid connections

### 2.2 Required Changes

**New Implementation Needed:**
```typescript
const onConnect = useCallback(
  (connection: Connection) => {
    // NEW: Validate connection types
    const sourceNode = nodes.find(n => n.id === connection.source)
    const targetNode = nodes.find(n => n.id === connection.target)
    
    if (sourceNode && targetNode) {
      const sourceBlock = getBlock(sourceNode.data.blockType)
      const targetBlock = getBlock(targetNode.data.blockType)
      
      const sourceOutput = sourceBlock?.outputs.find(o => o.name === connection.sourceHandle)
      const targetInput = targetBlock?.inputs.find(i => i.name === connection.targetHandle)
      
      // Type validation logic
      if (!isValidConnection(sourceOutput, targetInput)) {
        toast('Type mismatch: ' + sourceOutput?.type + ' cannot connect to ' + targetInput?.type, 'warning')
        return // Reject connection
      }
    }
    
    takeSnapshot()
    setEdges((eds) => addEdge({ ...connection, ... }, eds))
  },
  [nodes, setEdges, takeSnapshot, toast],
)
```

**Impact:**
- ⚠️ **Medium Risk**: Requires new validation logic
- ⚠️ **User Experience**: Users may be confused when connections are rejected
- 📝 **Action Required**: 
  - Create `isValidConnection()` helper function
  - Handle edge cases (missing types, backward compatibility)
  - Add visual feedback for invalid connections

---

## 3. Streaming Architecture Shift

### 3.1 Current Architecture

**Current Pattern:**
- Streaming blocks have `run()` that returns placeholder outputs
- Streaming handled externally via `useHyperstreamSockets` React hook
- Execution engine (`src/lib/runAgent.ts:112-143`) supports `subscribe()` but current Hyperliquid blocks don't use it

**Current Flow:**
```
User creates agent → Agent deployed → useHyperstreamSockets hook subscribes → 
Events normalized → Trigger downstream execution
```

### 3.2 Proposed Architecture

**New Pattern:**
- New `hyperliquidStream` block has `subscribe()` method
- Block handles streaming internally (not via React hook)
- Execution engine already supports this pattern (`subscribeToAgent` calls `def.subscribe()`)

**New Flow:**
```
User creates agent → Agent deployed → subscribeToAgent finds trigger blocks → 
Block's subscribe() method called → WebSocket subscription created → 
Events normalized → onTrigger() called → Downstream execution
```

**Impact:**
- ✅ **Low Risk**: Execution engine already supports `subscribe()` pattern
- ⚠️ **Architecture Change**: Moving from React hook pattern to block-level subscriptions
- 📝 **Action Required**:
  - Implement `subscribe()` method in new `hyperliquidStream` block
  - Handle subscription cleanup when stream type changes
  - Ensure only one subscription per block instance

### 3.3 Critical Implementation Details

**Subscription Management:**
- Current `subscribe()` function (`src/services/hyperliquid/streams.ts:48-111`) returns cleanup function
- Block's `subscribe()` must track active subscription and cleanup properly
- When `streamType` input changes, must unsubscribe old and subscribe new

**Required Pattern:**
```typescript
subscribe: (inputs, onTrigger) => {
  let currentUnsubscribe: (() => void) | null = null
  
  const setupSubscription = () => {
    if (currentUnsubscribe) currentUnsubscribe()
    
    const streamType = inputs.streamType as HyperliquidStreamType
    const filters = buildFilters(inputs)
    
    currentUnsubscribe = subscribe(streamType, filters, (msg) => {
      const outputs = normalizeEventToOutputs(streamType, msg)
      onTrigger(outputs)
    })
  }
  
  setupSubscription()
  
  // Return cleanup
  return () => {
    if (currentUnsubscribe) currentUnsubscribe()
  }
}
```

**Challenge:** Block inputs can change at runtime, but `subscribe()` is only called once during agent activation. Need to handle input changes.

---

## 4. UI Component Updates

### 4.1 GenericNode Component

**Current State (`src/components/nodes/GenericNode.tsx:98-110`):**
- Outputs displayed as simple text list
- No type indicators
- No connection count
- No visual feedback for connected outputs

**Required Changes:**
- Display output types (color-coded badges)
- Show connection count per output
- Visual indicators for connected inputs
- Type compatibility warnings

**Impact:**
- ⚠️ **Medium Risk**: UI changes require careful design
- 📝 **Action Required**: Update `GenericNode.tsx` to show type hints and connection status

### 4.2 BlockInput Component

**Current State:**
- Inputs render based on `InputFieldType`
- No type acceptance display
- No connection source indicator

**Required Changes:**
- Show connected source block name and output field
- Display type compatibility status
- Allow disconnect button

**Impact:**
- ⚠️ **Medium Risk**: UI changes needed
- 📝 **Action Required**: Update `BlockInputs.tsx` to show connection info

---

## 5. Output Normalization

### 5.1 Current Normalization Functions

**Existing Functions (`src/services/hyperliquid/streams.ts:161-244`):**
- `tradeEventToOutputs()` - returns Record<string, string>
- `orderEventToOutputs()` - returns Record<string, string>
- `bookUpdateEventToOutputs()` - returns Record<string, string>
- `twapEventToOutputs()` - returns Record<string, string>
- `writerActionEventToOutputs()` - returns Record<string, string>

**Current Pattern:**
- All outputs are strings (even numbers)
- No type information preserved

### 5.2 Proposed Unified Outputs

**New Pattern:**
- Streamlined outputs (~10 total)
- Type hints: `streamType` (string), `data` (json), `price` (number), etc.
- Common fields always present (empty string if not applicable)

**Impact:**
- ✅ **Low Risk**: Normalization functions already exist
- ⚠️ **Breaking Change Risk**: Downstream blocks expecting specific outputs may break
- 📝 **Action Required**:
  - Create unified normalization function
  - Map stream-specific outputs to unified format
  - Ensure backward compatibility with existing blocks

---

## 6. Backward Compatibility Concerns

### 6.1 Existing Blocks Without Types

**Current State:**
- All existing blocks have no `type` field on outputs
- All existing blocks have no `accepts` field on inputs

**Impact:**
- ✅ **Safe**: Optional fields mean existing blocks continue to work
- ⚠️ **Warning**: Type validation will be skipped for blocks without types
- 📝 **Recommendation**: Gradually add types to existing blocks

### 6.2 Existing Agents Using Old Blocks

**Current State:**
- Existing agents use specialized blocks (`tradeAlert`, `orderFillAlert`, etc.)
- New unified block is additive (doesn't replace old blocks)

**Impact:**
- ✅ **Safe**: Old blocks remain functional
- ✅ **Safe**: Existing agents continue to work
- 📝 **Action Required**: None - backward compatible by design

### 6.3 Connection Data Structure

**Current State (`src/utils/buildConnectedModel.ts`):**
- Edges stored with `sourceHandle` and `targetHandle`
- No type information stored in edges

**Impact:**
- ✅ **Safe**: Edge structure doesn't change
- ⚠️ **Enhancement Opportunity**: Could store type info in edge metadata for validation

---

## 7. Critical Files That Must Change

### 7.1 Type Definitions (HIGH PRIORITY)
- ✅ `src/lib/blockRegistry.ts` - Add `type?` to `OutputField`, `accepts?` to `InputField`

### 7.2 Block Registration (HIGH PRIORITY)
- ✅ `src/lib/blocks.ts` - Add new `hyperliquidStream` block registration
- ⚠️ `src/lib/blocks.ts` - Optionally add types to existing blocks

### 7.3 Streaming Implementation (HIGH PRIORITY)
- ✅ `src/services/hyperliquid/streams.ts` - Add `streamTrigger()` function (or implement in block)
- ⚠️ `src/services/hyperliquid/streams.ts` - May need unified normalization function

### 7.4 Connection Validation (MEDIUM PRIORITY)
- ✅ `src/App.tsx` - Add type validation to `onConnect` callback
- ✅ Create new utility: `src/utils/connectionValidation.ts` (or similar)

### 7.5 UI Components (MEDIUM PRIORITY)
- ✅ `src/components/nodes/GenericNode.tsx` - Show type hints, connection indicators
- ✅ `src/components/nodes/BlockInputs.tsx` - Show connection source, type compatibility

### 7.6 Execution Engine (LOW PRIORITY - Already Supports)
- ✅ `src/lib/runAgent.ts` - Already supports `subscribe()` pattern, no changes needed

---

## 8. Potential Issues & Risks

### 8.1 Subscription Management

**Risk:** Block inputs can change, but `subscribe()` is only called once during agent activation.

**Mitigation:**
- Option A: Re-subscribe when inputs change (requires input change detection)
- Option B: Document that stream type changes require agent redeployment
- Option C: Implement reactive subscription updates (complex)

**Recommendation:** Start with Option B (document limitation), consider Option C for future enhancement.

### 8.2 Type Validation Edge Cases

**Risk:** What happens when:
- Source block has no type information?
- Target block has no `accepts` field?
- Types don't match but user wants to connect anyway?

**Mitigation:**
- Allow connections when types are missing (backward compatibility)
- Warn but don't block when types don't match
- Store type mismatch in edge metadata for future validation

### 8.3 Output Type Coercion

**Risk:** All outputs are currently strings, but plan proposes `number` type for `price`, `size`, etc.

**Impact:**
- Execution engine expects `Record<string, string>`
- Downstream blocks receive strings, not numbers
- Type hints are for validation only, not runtime types

**Mitigation:**
- Keep outputs as strings (current pattern)
- Type hints are metadata only
- Document that numeric outputs are string representations

### 8.4 Multiple Subscriptions Per Block

**Risk:** Plan states "only one subscription at a time", but what if user has multiple `hyperliquidStream` blocks?

**Impact:**
- Each block instance should have its own subscription
- Current `subscribe()` function creates new WebSocket per call
- No issue - each block manages its own subscription

**Mitigation:** None needed - architecture already supports this.

---

## 9. Testing Considerations

### 9.1 Unit Tests Needed
- Type validation logic (`isValidConnection()`)
- Output normalization for unified format
- Subscription cleanup on stream type change
- Filter building from inputs

### 9.2 Integration Tests Needed
- Block subscription lifecycle
- Connection creation with type validation
- Downstream execution with unified outputs
- Multiple block instances with different stream types

### 9.3 Manual Testing Required
- Create agent with new `hyperliquidStream` block
- Change stream type and verify cleanup
- Connect outputs to inputs with type validation
- Test backward compatibility with existing agents

---

## 10. Migration Strategy

### 10.1 Phase 1: Type System Foundation
1. Add optional `type` field to `OutputField`
2. Add optional `accepts` field to `InputField`
3. Update TypeScript types (ensure backward compatibility)

### 10.2 Phase 2: Connection Validation
1. Implement `isValidConnection()` utility
2. Add validation to `onConnect` callback
3. Add visual feedback for invalid connections

### 10.3 Phase 3: Unified Streaming Block
1. Implement `streamTrigger()` function or block `subscribe()` method
2. Create unified output normalization
3. Register new `hyperliquidStream` block
4. Test subscription lifecycle

### 10.4 Phase 4: UI Enhancements
1. Add type hints to `GenericNode`
2. Add connection indicators to inputs/outputs
3. Add type compatibility warnings

### 10.5 Phase 5: Gradual Type Migration (Optional)
1. Add types to existing blocks incrementally
2. Update documentation
3. Encourage users to use typed blocks

---

## 11. Summary of Critical Impacts

### High Impact (Must Address)
1. ✅ **Type System Extensions** - Core type definitions must be updated
2. ✅ **New Block Implementation** - Unified streaming block must be created
3. ✅ **Subscription Management** - Block-level subscription pattern must be implemented

### Medium Impact (Should Address)
4. ⚠️ **Connection Validation** - Improves UX but not critical for functionality
5. ⚠️ **UI Type Indicators** - Enhances usability but not required for core feature

### Low Impact (Nice to Have)
6. 📝 **Type Migration** - Existing blocks work without types
7. 📝 **Visual Enhancements** - Connection indicators, type badges

---

## 12. Recommendations

1. **Start with Type System**: Add optional type fields first (low risk, enables future features)
2. **Implement Block First**: Create unified streaming block with `subscribe()` method
3. **Add Validation Later**: Connection validation can be added incrementally
4. **Keep Backward Compatible**: All changes should be optional/additive
5. **Document Limitations**: Clearly document that stream type changes require redeployment (initially)

---

## Conclusion

The proposed changes are **architecturally sound** and **backward compatible**. The main risks are:
- Subscription management complexity (handling input changes)
- Type validation edge cases (missing types, mismatches)
- UI complexity (showing type hints and connection status)

All critical impacts are **manageable** with careful implementation. The execution engine already supports the required patterns, making this a **low-risk enhancement** that adds significant value.
