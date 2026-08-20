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

const RADIUS_STEP = 230;
// Horizontal gap between independent root trees (normally there is exactly
// one root — the business unit's executive — but this keeps multi-root data
// readable instead of stacking nodes on top of each other).
const ROOT_GAP = 950;

function countLeaves(node: AgentTreeNode): number {
  return node.children.length === 0
    ? 1
    : node.children.reduce((sum, child) => sum + countLeaves(child), 0);
}

// Radial tree layout: each node's children split its angular slice
// proportionally to their own subtree size, so branches never overlap.
export function layoutRadialTree(roots: AgentTreeNode[]): Map<string, RadialPosition> {
  const positions = new Map<string, RadialPosition>();

  roots.forEach((root, rootIndex) => {
    const offsetX = rootIndex * ROOT_GAP;
    positions.set(root.id, { x: offsetX, y: 0 });

    function place(node: AgentTreeNode, angleStart: number, angleEnd: number, depth: number) {
      const total = node.children.reduce((sum, child) => sum + countLeaves(child), 0) || 1;
      let cursor = angleStart;

      for (const child of node.children) {
        const weight = countLeaves(child);
        const slice = ((angleEnd - angleStart) * weight) / total;
        const childStart = cursor;
        const childEnd = cursor + slice;
        const mid = (childStart + childEnd) / 2;
        const radius = depth * RADIUS_STEP;

        positions.set(child.id, {
          x: offsetX + radius * Math.cos(mid),
          y: radius * Math.sin(mid),
        });

        place(child, childStart, childEnd, depth + 1);
        cursor = childEnd;
      }
    }

    place(root, 0, Math.PI * 2, 1);
  });

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
