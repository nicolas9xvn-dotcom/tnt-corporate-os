"use client";

import { useCallback, useMemo, useState, type MouseEvent } from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Agent, AgentLevel, AgentStatus, AgentTreeNode, Department } from "@/lib/types";
import { buildAgentTree, layoutRadialTree, pickDirection, type RadialPosition } from "@/lib/org-tree";
import { DepartmentIcon } from "./department-icon";
import { RunTaskForm } from "./run-task-form";

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

const NODE_WIDTH = 210;
const NODE_HEIGHT = 96;
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
      style={{ width: NODE_WIDTH }}
      className={`cursor-pointer rounded-md border px-3.5 py-3 text-left backdrop-blur-sm transition-transform hover:scale-[1.03] ${
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

      <span className="block truncate text-[0.95rem] font-semibold text-slate-100">{agent.name}</span>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {agent.level && (
          <span
            className={`rounded-full border px-2 py-0.5 text-[0.68rem] font-medium ${LEVEL_STYLE[agent.level]}`}
          >
            {LEVEL_LABEL[agent.level]}
          </span>
        )}
        <span className="flex items-center gap-1 text-[0.68rem] text-slate-500">
          <span className={`h-2 w-2 rounded-full ${STATUS_DOT[agent.status]}`} />
          {STATUS_LABEL[agent.status]}
        </span>
      </div>

      {(agent.role || department) && (
        <div className="mt-2 flex items-center justify-between gap-1.5 text-xs text-slate-500">
          <span className="truncate">{agent.role}</span>
          {department && <DepartmentIcon department={department} size="sm" />}
        </div>
      )}
    </div>
  );
}

const nodeTypes = { agent: AgentNodeCard };

function AgentDetailPanel({
  node,
  department,
  onClose,
}: {
  node: AgentTreeNode;
  department: Department | null;
  onClose: () => void;
}) {
  return (
    <div className="hud-expand-in hud-panel absolute inset-x-3 bottom-3 z-20 max-h-[70%] overflow-y-auto rounded-lg p-4 sm:inset-x-auto sm:top-3 sm:right-3 sm:bottom-auto sm:w-[22rem]">
      <div className="flex items-start justify-between gap-3">
        <div>
          {department && (
            <div className="mb-1.5 flex items-center gap-1.5">
              <DepartmentIcon department={department} size="sm" />
              <span className="text-xs text-slate-400">{department.name}</span>
            </div>
          )}
          <h3 className="hud-title text-lg font-bold text-white">{node.name}</h3>
          {node.role && <p className="text-sm text-slate-400">{node.role}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-400 transition hover:border-cyan-700 hover:text-cyan-300"
        >
          Đóng
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {node.level && (
          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${LEVEL_STYLE[node.level]}`}>
            {LEVEL_LABEL[node.level]}
          </span>
        )}
        <span className="flex items-center gap-1 text-xs text-slate-500">
          <span className={`h-2 w-2 rounded-full ${STATUS_DOT[node.status]}`} />
          {STATUS_LABEL[node.status]}
        </span>
        {node.approval_level && (
          <span className="rounded-full border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-xs text-slate-400">
            Approval level {node.approval_level}
          </span>
        )}
      </div>

      {node.responsibilities && node.responsibilities.length > 0 && (
        <div className="mt-3">
          <p className="hud-eyebrow text-[0.65rem]">Trách nhiệm</p>
          <ul className="mt-1 list-disc pl-4 text-sm text-slate-300">
            {node.responsibilities.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {node.escalation_note && (
        <div className="mt-3">
          <p className="hud-eyebrow text-[0.65rem]">Ghi chú</p>
          <p className="mt-1 text-sm text-slate-300">{node.escalation_note}</p>
        </div>
      )}

      {node.system_prompt ? (
        <>
          <div className="mt-3">
            <p className="hud-eyebrow text-[0.65rem]">System prompt</p>
            <p className="mt-1 whitespace-pre-line rounded-md border border-slate-800 bg-slate-950/60 p-2.5 text-xs leading-relaxed text-slate-400">
              {node.system_prompt}
            </p>
          </div>
          <RunTaskForm agentId={node.id} />
        </>
      ) : (
        <p className="mt-3 text-xs italic text-amber-400/80">
          Chưa có system prompt cho agent này — chưa thể giao việc.
        </p>
      )}
    </div>
  );
}

function FlowCanvas({ agents, departments }: { agents: Agent[]; departments: Department[] }) {
  const { setCenter, fitView } = useReactFlow();
  const [selected, setSelected] = useState<{ node: AgentTreeNode; department: Department | null } | null>(null);

  const { nodes, edges } = useMemo(() => {
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

  const handleNodeClick = useCallback(
    (_event: MouseEvent, node: Node) => {
      const data = node.data as AgentNodeData;
      setSelected({ node: data.agent, department: data.department });
      setCenter(node.position.x + NODE_WIDTH / 2, node.position.y + NODE_HEIGHT / 2, {
        zoom: 1.15,
        duration: 450,
      });
    },
    [setCenter]
  );

  const handleClose = useCallback(() => {
    setSelected(null);
    fitView({ padding: 0.35, duration: 450 });
  }, [fitView]);

  return (
    <div className="relative h-[560px] w-full overflow-hidden rounded-lg border border-cyan-900/30 sm:h-[640px]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        onPaneClick={handleClose}
        fitView
        fitViewOptions={{ padding: 0.35 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={1.8}
        colorMode="dark"
      >
        <Background color="#0891b2" gap={26} size={1} style={{ opacity: 0.25 }} />
        <Controls
          showInteractive={false}
          className="[&>button]:!border-cyan-900/50 [&>button]:!bg-slate-900/90 [&>button]:!fill-cyan-300 [&>button]:!text-cyan-300"
        />
      </ReactFlow>

      {selected && (
        <AgentDetailPanel node={selected.node} department={selected.department} onClose={handleClose} />
      )}
    </div>
  );
}

export function NetworkView({ agents, departments }: { agents: Agent[]; departments: Department[] }) {
  if (agents.length === 0) {
    return <p className="text-sm text-slate-600">Chưa có agent nào trong công ty con này.</p>;
  }

  return (
    <ReactFlowProvider>
      <FlowCanvas agents={agents} departments={departments} />
    </ReactFlowProvider>
  );
}
