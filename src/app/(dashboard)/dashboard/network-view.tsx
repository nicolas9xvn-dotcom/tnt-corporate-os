"use client";

import { useMemo } from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Agent, AgentLevel, AgentStatus, AgentTreeNode, Department } from "@/lib/types";
import { buildAgentTree, layoutRadialTree, pickDirection, type RadialPosition } from "@/lib/org-tree";
import { DepartmentIcon } from "./department-icon";

const LEVEL_LABEL: Record<AgentLevel, string> = {
  executive: "Executive",
  director: "Director",
  manager: "Manager",
  specialist: "Specialist",
};

const LEVEL_STYLE: Record<AgentLevel, string> = {
  executive: "bg-cyan-500/15 text-cyan-300 border-cyan-700",
  director: "bg-violet-500/15 text-violet-300 border-violet-800",
  manager: "bg-amber-500/15 text-amber-300 border-amber-800",
  specialist: "bg-slate-700/40 text-slate-300 border-slate-700",
};

const STATUS_DOT: Record<AgentStatus, string> = {
  active: "bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.6)]",
  running: "bg-cyan-400 shadow-[0_0_6px_2px_rgba(34,211,238,0.7)] animate-pulse",
  idle: "bg-slate-500",
  waiting: "bg-amber-400",
  warning: "bg-amber-400",
  error: "bg-red-500",
  approval_required: "bg-violet-400",
  offline: "bg-slate-700",
};

const STATUS_LABEL: Record<AgentStatus, string> = {
  active: "Đang hoạt động",
  running: "Đang chạy",
  idle: "Rảnh",
  waiting: "Đang chờ",
  warning: "Cảnh báo",
  error: "Lỗi",
  approval_required: "Chờ duyệt",
  offline: "Offline",
};

const handleStyle = { opacity: 0, width: 1, height: 1 };

type AgentNodeData = { agent: AgentTreeNode; department: Department | null };

function AgentNodeCard({ data }: NodeProps<Node<AgentNodeData>>) {
  const { agent, department } = data;
  const isExecutive = agent.level === "executive";

  return (
    <div
      role="button"
      tabIndex={0}
      data-hud-sound
      className={`w-[190px] cursor-grab rounded-md border px-3 py-2 text-left backdrop-blur-sm active:cursor-grabbing ${
        isExecutive
          ? "border-cyan-500/70 bg-cyan-950/50 shadow-[0_0_32px_-6px_rgba(34,211,238,0.8)]"
          : "border-cyan-900/40 bg-slate-950/70 shadow-[0_4px_18px_-6px_rgba(0,0,0,0.6)]"
      }`}
    >
      <Handle type="target" id="top" position={Position.Top} style={handleStyle} />
      <Handle type="source" id="top" position={Position.Top} style={handleStyle} />
      <Handle type="target" id="right" position={Position.Right} style={handleStyle} />
      <Handle type="source" id="right" position={Position.Right} style={handleStyle} />
      <Handle type="target" id="bottom" position={Position.Bottom} style={handleStyle} />
      <Handle type="source" id="bottom" position={Position.Bottom} style={handleStyle} />
      <Handle type="target" id="left" position={Position.Left} style={handleStyle} />
      <Handle type="source" id="left" position={Position.Left} style={handleStyle} />

      <span className="block truncate text-sm font-semibold text-slate-100">{agent.name}</span>

      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {agent.level && (
          <span
            className={`rounded-full border px-1.5 py-0.5 text-[0.6rem] font-medium ${LEVEL_STYLE[agent.level]}`}
          >
            {LEVEL_LABEL[agent.level]}
          </span>
        )}
        <span className="flex items-center gap-1 text-[0.6rem] text-slate-500">
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[agent.status]}`} />
          {STATUS_LABEL[agent.status]}
        </span>
      </div>

      {(agent.role || department) && (
        <div className="mt-1.5 flex items-center justify-between gap-1.5 text-[0.65rem] text-slate-500">
          <span className="truncate">{agent.role}</span>
          {department && <DepartmentIcon department={department} size="sm" />}
        </div>
      )}
    </div>
  );
}

const nodeTypes = { agent: AgentNodeCard };

export function NetworkView({ agents, departments }: { agents: Agent[]; departments: Department[] }) {
  const { nodes, edges } = useMemo(() => {
    if (agents.length === 0) return { nodes: [] as Node[], edges: [] as Edge[] };

    const departmentsById = new Map(departments.map((d) => [d.id, d]));
    const roots = buildAgentTree(agents);
    const positions = layoutRadialTree(roots);

    const nodes: Node[] = [];
    const edges: Edge[] = [];

    function walk(node: AgentTreeNode, parentPos?: RadialPosition) {
      const pos = positions.get(node.id) ?? { x: 0, y: 0 };
      const department = node.department_id ? departmentsById.get(node.department_id) ?? null : null;

      nodes.push({
        id: node.id,
        type: "agent",
        position: pos,
        data: { agent: node, department },
        draggable: true,
      });

      if (parentPos) {
        const fromDir = pickDirection(parentPos, pos);
        const toDir = pickDirection(pos, parentPos);
        edges.push({
          id: `${node.reports_to}-${node.id}`,
          source: node.reports_to as string,
          target: node.id,
          sourceHandle: fromDir,
          targetHandle: toDir,
          animated: true,
          style: {
            stroke: "#22d3ee",
            strokeOpacity: 0.85,
            strokeWidth: 2,
            filter: "drop-shadow(0 0 4px rgba(34, 211, 238, 0.65))",
          },
        });
      }

      for (const child of node.children) {
        walk(child, pos);
      }
    }

    roots.forEach((root) => walk(root));

    return { nodes, edges };
  }, [agents, departments]);

  if (agents.length === 0) {
    return <p className="text-sm text-slate-600">Chưa có agent nào trong công ty con này.</p>;
  }

  return (
    <div className="h-[520px] w-full overflow-hidden rounded-lg border border-cyan-900/30 sm:h-[620px]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.35 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.25}
        maxZoom={1.5}
        colorMode="dark"
      >
        <Background color="#0891b2" gap={26} size={1} style={{ opacity: 0.25 }} />
        <Controls showInteractive={false} className="[&>button]:!border-cyan-900/50 [&>button]:!bg-slate-900/90 [&>button]:!fill-cyan-300 [&>button]:!text-cyan-300" />
      </ReactFlow>
    </div>
  );
}
