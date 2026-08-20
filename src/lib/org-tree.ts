import type { Agent, AgentTreeNode } from "./types";

export function buildAgentTree(agents: Agent[]): AgentTreeNode[] {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const childrenOf = new Map<string, Agent[]>();
  const roots: Agent[] = [];

  for (const agent of agents) {
    if (agent.reports_to && byId.has(agent.reports_to)) {
      const siblings = childrenOf.get(agent.reports_to) ?? [];
      siblings.push(agent);
      childrenOf.set(agent.reports_to, siblings);
    } else {
      roots.push(agent);
    }
  }

  function attach(agent: Agent): AgentTreeNode {
    return { ...agent, children: (childrenOf.get(agent.id) ?? []).map(attach) };
  }

  return roots.map(attach);
}

export interface RadialPosition {
  x: number;
  y: number;
}

// Horizontal gap between independent root trees (normally there is exactly
// one root — the business unit's executive — but this keeps multi-root data
// readable instead of stacking nodes on top of each other).
const ROOT_GAP = 1400;
// Minimum straight-line distance to keep between two adjacent siblings'
// centers, so ~210px-wide node cards never touch.
const MIN_NODE_GAP = 260;
// Minimum radius increase per depth level, regardless of how much angular
// room a ring has — keeps parent/child edges from being too short.
const MIN_RING_GAP = 210;

function countLeaves(node: AgentTreeNode): number {
  return node.children.length === 0
    ? 1
    : node.children.reduce((sum, child) => sum + countLeaves(child), 0);
}

interface AngleEntry {
  id: string;
  rootIndex: number;
  depth: number;
  angleStart: number;
  angleEnd: number;
}

// Radial tree layout in two passes:
//  1. Give every node an angular slice proportional to its subtree size (so
//     branches never cross one another).
//  2. Derive each depth's radius from the narrowest slice that actually
//     occurs at that depth, so two adjacent siblings are never closer than
//     MIN_NODE_GAP apart — a fixed radius-per-depth would let dense rings
//     (e.g. several single-agent branches sitting side by side) overlap.
export function layoutRadialTree(roots: AgentTreeNode[]): Map<string, RadialPosition> {
  const entries: AngleEntry[] = [];

  roots.forEach((root, rootIndex) => {
    entries.push({ id: root.id, rootIndex, depth: 0, angleStart: 0, angleEnd: Math.PI * 2 });

    function assignAngles(node: AgentTreeNode, angleStart: number, angleEnd: number, depth: number) {
      const total = node.children.reduce((sum, child) => sum + countLeaves(child), 0) || 1;
      let cursor = angleStart;

      for (const child of node.children) {
        const weight = countLeaves(child);
        const slice = ((angleEnd - angleStart) * weight) / total;
        const childStart = cursor;
        const childEnd = cursor + slice;

        entries.push({ id: child.id, rootIndex, depth, angleStart: childStart, angleEnd: childEnd });
        assignAngles(child, childStart, childEnd, depth + 1);
        cursor = childEnd;
      }
    }

    assignAngles(root, 0, Math.PI * 2, 1);
  });

  const maxDepth = entries.reduce((max, e) => Math.max(max, e.depth), 0);
  const minSliceByDepth = new Map<number, number>();
  for (const entry of entries) {
    if (entry.depth === 0) continue;
    const width = entry.angleEnd - entry.angleStart;
    const current = minSliceByDepth.get(entry.depth);
    if (current === undefined || width < current) minSliceByDepth.set(entry.depth, width);
  }

  const radiusByDepth = new Map<number, number>([[0, 0]]);
  for (let depth = 1; depth <= maxDepth; depth++) {
    const narrowest = Math.min(minSliceByDepth.get(depth) ?? Math.PI, Math.PI / 2);
    const requiredForSpacing = MIN_NODE_GAP / (2 * Math.sin(narrowest / 2));
    const previous = radiusByDepth.get(depth - 1) ?? 0;
    radiusByDepth.set(depth, Math.max(previous + MIN_RING_GAP, requiredForSpacing));
  }

  const positions = new Map<string, RadialPosition>();
  for (const entry of entries) {
    const offsetX = entry.rootIndex * ROOT_GAP;
    const radius = radiusByDepth.get(entry.depth) ?? 0;
    const mid = (entry.angleStart + entry.angleEnd) / 2;
    positions.set(entry.id, {
      x: offsetX + radius * Math.cos(mid),
      y: radius * Math.sin(mid),
    });
  }

  return positions;
}

export type CardinalDirection = "top" | "right" | "bottom" | "left";

// Which side of a node an edge should anchor to, based on the direction
// from `from` to `to` — used since handle positions are fixed (N/E/S/W)
// while a radial layout's connections can point any which way.
export function pickDirection(from: RadialPosition, to: RadialPosition): CardinalDirection {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "bottom" : "top";
}
