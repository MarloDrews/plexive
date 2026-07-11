// Client mirrors of the backend Net-graph payloads. Kept in sync by hand with
// backend/app/schemas.py (GraphNode / GraphEdge / GraphResponse / AnsweredOut).

export interface GraphNode {
  id: number
  format: string
  title: string
  tags: string[]
  primary_category_name?: string | null
  // Number of quiz questions in the post (0 = no quiz). The node turns green
  // once the viewer has answered all quiz_total of them.
  quiz_total: number
}

export interface GraphEdge {
  source: number
  target: number
  weight: number
  kind: string // "tag" | "bridge"
}

export interface GraphResponse {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface AnsweredResponse {
  // post_id -> number of distinct quiz questions the user has answered. JSON
  // object keys are strings, but numeric indexing (counts[node.id]) still works.
  counts: Record<number, number>
}
