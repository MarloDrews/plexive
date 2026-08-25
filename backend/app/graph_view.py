"""Build the Net view's post graph: nodes = published posts, edges connect
related posts, and the whole graph is guaranteed to be ONE connected component
so the Net view never shows a floating node.

Edges come from shared tags -- the one universal signal, since every post carries
1-4 taxonomy slugs while the authored connections/post_edges graph is too sparse
to guarantee connectivity today. For each node we keep its top-K most similar
tag-neighbours (Jaccard), take the union across nodes, then run a deterministic
bridging pass that stitches any leftover components (including a tag-disjoint
singleton) into a single component. Everything is ordered by ascending post id so
the edge set is reproducible run to run. v1 is tag-only; overlaying resolved
post_edges as kind="link" is a clean future extension that does not touch the
connectivity proof.
"""

from collections import defaultdict
from itertools import combinations
from typing import Dict, List, Optional, Set, Tuple

from sqlalchemy.orm import Session, selectinload

from .models import Post, User
from .post_counts import primary_category_name
from .routers._shared import visible_posts_filter
from .schemas import GraphEdge, GraphNode, GraphResponse

# Top-K tag-neighbours kept per node. Bounds edge count to <= K*n so one popular
# tag cannot explode into an n^2 hairball while keeping each node well-linked.
NEIGHBOUR_CAP = 6
# Weight for a bridge edge between two posts that share no tags at all, so the
# force layout still treats it as a (very weak) spring rather than a rigid link.
MIN_BRIDGE_WEIGHT = 0.01


def count_quiz_items(sections) -> int:
    """Number of questions in the post's quiz section (0 if none).

    Mirrors quiz._get_quiz_items' isinstance tolerance: seed/legacy sections are
    arbitrary JSON, so a non-dict section or a non-list quiz content must not
    crash the graph endpoint.
    """
    for section in (sections or []):
        if isinstance(section, dict) and section.get("type") == "quiz":
            content = section.get("content")
            return len(content) if isinstance(content, list) else 0
    return 0


class _UnionFind:
    """Minimal union-find over post ids for the connected-component pass."""

    def __init__(self, ids):
        self.parent = {i: i for i in ids}

    def find(self, x):
        root = x
        while self.parent[root] != root:
            root = self.parent[root]
        # Path compression: point everything on the walk straight at the root.
        while self.parent[x] != root:
            self.parent[x], x = root, self.parent[x]
        return root

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[rb] = ra


def build_nodes(posts: List[Post]) -> List[GraphNode]:
    """Project posts into lightweight graph nodes, ordered by ascending id."""
    nodes = [
        GraphNode(
            id=p.id,
            format=p.format,
            title=p.title,
            tags=p.tags,  # GraphNode.clean_tags coerces legacy/junk tags
            primary_category_name=primary_category_name(p),
            quiz_total=count_quiz_items(p.sections),
        )
        for p in posts
    ]
    nodes.sort(key=lambda n: n.id)
    return nodes


def _best_cross_pair(base: Set[int], comp: Set[int], shared) -> Tuple[int, int, int]:
    """The (shared_tag_count, lo_id, hi_id) maximizing shared tags between the
    two components, tie-broken by (min id, then min id). Falls back to shared=0
    on the lowest-id nodes when the components are tag-disjoint, so a bridge
    always exists."""
    best: Optional[Tuple[int, int, int]] = None
    for a in base:
        for b in comp:
            lo, hi = (a, b) if a < b else (b, a)
            s = shared.get((lo, hi), 0)
            cand = (s, lo, hi)
            if best is None or (cand[0], -cand[1], -cand[2]) > (best[0], -best[1], -best[2]):
                best = cand
    if best is None:
        # Both sets are non-empty by construction; guard against a caller misuse.
        return (0, min(base), min(comp))
    return best


def build_edges(nodes: List[GraphNode]) -> List[GraphEdge]:
    """Compute the undirected edge set: top-K shared-tag neighbours per node,
    then bridge every component into one. Deterministic (all ties break on
    ascending id), so the returned edges are stable across calls."""
    ids = sorted(n.id for n in nodes)
    if len(ids) <= 1:
        return []
    tags_by_id: Dict[int, Set[str]] = {n.id: set(n.tags) for n in nodes}

    # 1. Shared-tag counts via an inverted index -- only pairs sharing >=1 tag.
    posts_by_tag: Dict[str, List[int]] = defaultdict(list)
    for pid in ids:
        for t in tags_by_id[pid]:
            posts_by_tag[t].append(pid)
    shared: Dict[Tuple[int, int], int] = defaultdict(int)
    for plist in posts_by_tag.values():
        for a, b in combinations(sorted(plist), 2):
            shared[(a, b)] += 1

    def pair(a, b):
        return (a, b) if a < b else (b, a)

    def jaccard(a, b):
        s = shared.get(pair(a, b), 0)
        if s == 0:
            return 0.0
        union = len(tags_by_id[a] | tags_by_id[b])
        return s / union if union else 0.0

    # Candidate neighbours = everyone a node shares at least one tag with.
    neighbours: Dict[int, Set[int]] = defaultdict(set)
    for a, b in shared:
        neighbours[a].add(b)
        neighbours[b].add(a)

    # 2. Keep each node's top-K neighbours (union: keep if EITHER endpoint ranks
    #    it), ranked by shared count then Jaccard then id.
    kept: Dict[frozenset, float] = {}
    for pid in ids:
        ranked = sorted(
            neighbours[pid],
            key=lambda o: (-shared[pair(pid, o)], -jaccard(pid, o), o),
        )
        for o in ranked[:NEIGHBOUR_CAP]:
            kept[frozenset((pid, o))] = jaccard(pid, o)

    # 3. Connected components over the kept edges.
    uf = _UnionFind(ids)
    for e in kept:
        a, b = tuple(e)
        uf.union(a, b)
    comps_map: Dict[int, Set[int]] = defaultdict(set)
    for pid in ids:
        comps_map[uf.find(pid)].add(pid)
    comps = list(comps_map.values())

    # 4. Bridge every component into one, growing from the largest. Each step
    #    attaches the remaining component whose best cross-pair shares the most
    #    tags (ties -> lowest ids), so bridges follow real thematic proximity;
    #    a tag-disjoint singleton is attached via a weight~0 bridge. The loop
    #    ends only when a single component remains, so connectivity is
    #    structural, not heuristic.
    bridge_edges: Set[frozenset] = set()
    comps.sort(key=lambda c: (-len(c), min(c)))
    base = comps[0]
    rest = comps[1:]
    while rest:
        best = None  # (shared, lo, hi, rest_index)
        for idx, comp in enumerate(rest):
            s, a, b = _best_cross_pair(base, comp, shared)
            cand = (s, a, b, idx)
            if best is None or (cand[0], -cand[1], -cand[2]) > (best[0], -best[1], -best[2]):
                best = cand
        s, a, b, idx = best
        key = frozenset((a, b))
        # Cross-component pair is never already kept (a kept edge would have
        # merged them), so this always adds a new, connectivity-guaranteeing edge.
        kept[key] = jaccard(a, b) or MIN_BRIDGE_WEIGHT
        bridge_edges.add(key)
        base = base | rest.pop(idx)

    edges = [
        GraphEdge(
            source=min(e),
            target=max(e),
            weight=round(w, 4),
            kind="bridge" if e in bridge_edges else "tag",
        )
        for e, w in kept.items()
    ]
    edges.sort(key=lambda e: (e.source, e.target))
    return edges


def build_graph(db: Session, viewer: Optional[User]) -> GraphResponse:
    """Every published, viewer-visible post as a node, plus a tag-similarity edge
    set guaranteed to form a single connected component."""
    posts = (
        db.query(Post)
        .options(selectinload(Post.interests))
        .filter(Post.status == "published", visible_posts_filter(viewer))
        .all()
    )
    nodes = build_nodes(posts)
    edges = build_edges(nodes)
    return GraphResponse(nodes=nodes, edges=edges)
