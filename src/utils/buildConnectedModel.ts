import type { Edge, Node } from '@xyflow/react'

/** Represents an incoming connection to a node (input) */
export interface InputConnection {
  sourceNodeId: string
  sourceHandle?: string
  edgeId: string
}

/** Represents an outgoing connection from a node (output) */
export interface OutputConnection {
  targetNodeId: string
  targetHandle?: string
  edgeId: string
}

/** A node in the connected model with its data and connection info */
export interface ConnectedNode {
  id: string
  type: string
  data: Record<string, unknown>
  inputs: InputConnection[]
  outputs: OutputConnection[]
}

/** The full connected model ready for agent execution */
export interface ConnectedModel {
  version: string
  exportedAt: string
  nodes: ConnectedNode[]
  edges: Array<{
    id: string
    source: string
    target: string
    sourceHandle?: string
    targetHandle?: string
  }>
}

/**
 * Builds a data structure for the connected model when deploying the agent.
 * Each node includes its data and connection info (inputs/outputs) for wiring
 * function inputs and outputs during execution.
 */
export function buildConnectedModel(nodes: Node[], edges: Edge[]): ConnectedModel {
  const nodeMap = new Map<string, ConnectedNode>()

  // Initialize each node with empty connections
  for (const node of nodes) {
    nodeMap.set(node.id, {
      id: node.id,
      type: (node.type ?? 'unknown') as string,
      data: { ...node.data },
      inputs: [],
      outputs: [],
    })
  }

  // Populate connections from edges
  for (const edge of edges) {
    const sourceNode = nodeMap.get(edge.source)
    const targetNode = nodeMap.get(edge.target)

    if (sourceNode) {
      sourceNode.outputs.push({
        targetNodeId: edge.target,
        targetHandle: edge.targetHandle ?? undefined,
        edgeId: edge.id,
      })
    }

    if (targetNode) {
      targetNode.inputs.push({
        sourceNodeId: edge.source,
        sourceHandle: edge.sourceHandle ?? undefined,
        edgeId: edge.id,
      })
    }
  }

  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    nodes: Array.from(nodeMap.values()),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
    })),
  }
}
