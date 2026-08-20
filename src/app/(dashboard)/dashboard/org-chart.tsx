"use client";

import type { Agent, AgentLevel, AgentStatus, AgentTreeNode, Department } from "@/lib/types";

function buildAgentTree(agents: Agent[]): AgentTreeNode[] {
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

const LEVEL_LABEL: Record<AgentLevel, string> = {
  executive: "Executive",
  director: "Director",
  manager: "Manager",
  specialist: "Specialist",
};

const LEVEL_STYLE: Record<AgentLevel, string> = {
  executive: "bg-sky-500/15 text-sky-300 border-sky-800",
  director: "bg-violet-500/15 text-violet-300 border-violet-800",
  manager: "bg-amber-500/15 text-amber-300 border-amber-800",
  specialist: "bg-slate-700/40 text-slate-300 border-slate-700",
};

const STATUS_DOT: Record<AgentStatus, string> = {
  active: "bg-emerald-400",
  running: "bg-sky-400 animate-pulse",
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

function AgentCard({ node, departmentName }: { node: AgentTreeNode; departmentName: string | null }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-100">{node.name}</span>
        {node.level && (
          <span className={`rounded-full border px-2 py-0.5 text-[0.65rem] font-medium ${LEVEL_STYLE[node.level]}`}>
            {LEVEL_LABEL[node.level]}
          </span>
        )}
        <span className="flex items-center gap-1 text-[0.65rem] text-slate-500">
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[node.status]}`} />
          {STATUS_LABEL[node.status]}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
        {node.role && <span>{node.role}</span>}
        {departmentName && (
          <span className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[0.65rem] text-slate-400">
            {departmentName}
          </span>
        )}
      </div>
      {node.escalation_note && (
        <p className="text-[0.7rem] italic text-slate-600">{node.escalation_note}</p>
      )}
    </div>
  );
}

function AgentBranch({
  node,
  departmentsById,
}: {
  node: AgentTreeNode;
  departmentsById: Map<string, string>;
}) {
  const departmentName = node.department_id ? departmentsById.get(node.department_id) ?? null : null;

  return (
    <li className="relative pl-4">
      <AgentCard node={node} departmentName={departmentName} />
      {node.children.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2 border-l border-slate-800 pl-4">
          {node.children.map((child) => (
            <AgentBranch key={child.id} node={child} departmentsById={departmentsById} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function OrgChart({ agents, departments }: { agents: Agent[]; departments: Department[] }) {
  if (agents.length === 0) {
    return <p className="text-sm text-slate-600">Chưa có agent nào trong công ty con này.</p>;
  }

  const departmentsById = new Map(departments.map((d) => [d.id, d.name]));
  const roots = buildAgentTree(agents);

  return (
    <ul className="flex flex-col gap-2">
      {roots.map((root) => (
        <AgentBranch key={root.id} node={root} departmentsById={departmentsById} />
      ))}
    </ul>
  );
}
