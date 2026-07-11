"""Net-graph algorithm tests (app/graph_view.py).

Run from backend/:
    .venv\\Scripts\\python.exe tests\\graph_test.py

Freezes the connectivity guarantee: the edge set from build_edges always forms
ONE connected component (no isolated node, no isolated cluster), even for a
tag-disjoint post; the algorithm is deterministic (identical edges across
calls); and quiz_total is counted tolerantly from sections. Pure-function tests,
no database needed (only the throwaway-DB env so the app modules import).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _throwaway_db  # noqa: F401 -- must run before any app import

from app.graph_view import build_edges, build_nodes, count_quiz_items  # noqa: E402
from app.schemas import GraphNode  # noqa: E402

PASS = 0


def check(name: str, condition: bool, detail: str = ""):
    global PASS
    assert condition, f"FAIL: {name} {detail}"
    PASS += 1
    print(f"ok: {name}")


def node(i, tags, quiz_total=0):
    return GraphNode(id=i, format="facts", title=f"post {i}", tags=tags, quiz_total=quiz_total)


def component_count(node_ids, edges):
    """Number of connected components spanned by `edges` over `node_ids`."""
    parent = {i: i for i in node_ids}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for e in edges:
        ra, rb = find(e.source), find(e.target)
        if ra != rb:
            parent[rb] = ra
    return len({find(i) for i in node_ids})


# 1. A normal tag cluster + a second cluster + a fully tag-disjoint post must all
#    end up in a single connected component.
nodes = [
    node(1, ["biology", "animals"]),
    node(2, ["animals", "longevity"]),
    node(3, ["longevity", "aging"]),
    node(4, ["physics", "space"]),
    node(5, ["space", "astronomy"]),
    node(6, ["orphan-tag-nobody-else-has"]),  # shares nothing with anyone
]
ids = [n.id for n in nodes]
edges = build_edges(nodes)
check("single connected component", component_count(ids, edges) == 1,
      f"got {component_count(ids, edges)} components")
covered = {e.source for e in edges} | {e.target for e in edges}
check("every node has at least one edge", covered == set(ids),
      f"uncovered={set(ids) - covered}")
check("orphan node is connected", 6 in covered)
check("orphan is attached by a bridge edge",
      any(e.kind == "bridge" and 6 in (e.source, e.target) for e in edges))
check("edges are undirected with source<target", all(e.source < e.target for e in edges))

# 2. Determinism: identical edge set (source, target, kind, weight) across calls.
sig = lambda es: [(e.source, e.target, e.kind, e.weight) for e in es]
check("deterministic edges across calls", sig(build_edges(nodes)) == sig(build_edges(nodes)))

# 3. Degenerate sizes.
check("empty graph -> no edges", build_edges([]) == [])
check("single node -> no edges", build_edges([node(1, ["x"])]) == [])

# 4. Two tag-disjoint nodes still get bridged into one component.
two = [node(1, ["a"]), node(2, ["b"])]
two_edges = build_edges(two)
check("two disjoint nodes bridged", component_count([1, 2], two_edges) == 1)
check("that bridge is kind=bridge", two_edges and two_edges[0].kind == "bridge")

# 5. Every node in a many-singleton graph (all-unique tags) still connects.
singles = [node(i, [f"tag-{i}"]) for i in range(1, 11)]
sids = [n.id for n in singles]
check("all-unique-tag graph is one component", component_count(sids, build_edges(singles)) == 1)

# 6. quiz_total counting from sections is tolerant of junk.
secs = [{"type": "essence", "content": "x"}, {"type": "quiz", "content": [1, 2, 3, 4, 5]}]
check("count_quiz_items counts quiz content", count_quiz_items(secs) == 5)
check("count_quiz_items 0 when no quiz", count_quiz_items([{"type": "essence"}]) == 0)
check("count_quiz_items tolerates junk", count_quiz_items([None, {"type": "quiz", "content": "bad"}]) == 0)
check("count_quiz_items tolerates None sections", count_quiz_items(None) == 0)

print(f"\n{PASS} checks passed")
