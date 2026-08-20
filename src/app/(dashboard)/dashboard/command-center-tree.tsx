"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { BusinessUnitWithTree, UserRole } from "@/lib/types";
import { CreateAgentForm } from "./create-agent-form";
import { CreateDepartmentForm } from "./create-department-form";
import { DepartmentIcon, DepartmentTabs } from "./department-icon";

// React Flow measures/positions nodes on mount (ResizeObserver etc.), which
// the server can't reproduce — rendering it during SSR causes a hydration
// mismatch. Client-only avoids that.
const NetworkView = dynamic(() => import("./network-view").then((m) => m.NetworkView), {
  ssr: false,
  loading: () => (
    <div className="flex h-[520px] items-center justify-center text-sm text-slate-600 sm:h-[620px]">
      Đang tải sơ đồ tổ chức...
    </div>
  ),
});

function StatusBadge({ status }: { status: BusinessUnitWithTree["status"] }) {
  const isActive = status === "active";
  return (
    <span
      className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${
        isActive
          ? "border-emerald-700/60 bg-emerald-950/50 text-emerald-300"
          : "border-slate-700 bg-slate-800/60 text-slate-400"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.6)]" : "bg-slate-500"}`}
      />
      {isActive ? "Đang hoạt động" : "Sắp triển khai"}
    </span>
  );
}

function AgentRow({ agent }: { agent: BusinessUnitWithTree["departments"][number]["agents"][number] }) {
  return (
    <li className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm">
      <div>
        <p className="font-medium text-slate-100">{agent.name}</p>
        {agent.role && <p className="text-xs text-slate-500">{agent.role}</p>}
      </div>
    </li>
  );
}

function DepartmentBlock({
  department,
  canManage,
}: {
  department: BusinessUnitWithTree["departments"][number];
  canManage: boolean;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-md border border-slate-800/80 bg-slate-900/30 p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <DepartmentIcon department={department} size="sm" />
          {department.name}
          {department.code && (
            <span className="text-xs font-normal text-slate-500">{department.code}</span>
          )}
        </span>
        <span className="text-xs text-slate-500">
          {department.agents.length} agent{department.agents.length !== 1 ? "s" : ""} {open ? "▾" : "▸"}
        </span>
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-2">
          <ul className="flex flex-col gap-2">
            {department.agents.length === 0 ? (
              <li className="text-xs text-slate-600">Chưa có agent nào trong phòng ban này.</li>
            ) : (
              department.agents.map((agent) => <AgentRow key={agent.id} agent={agent} />)
            )}
          </ul>
          {canManage && <CreateAgentForm departmentId={department.id} />}
        </div>
      )}
    </div>
  );
}

function BusinessUnitCard({
  businessUnit,
  canManage,
}: {
  businessUnit: BusinessUnitWithTree;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [manageOpen, setManageOpen] = useState(false);
  const totalAgents = businessUnit.agents.length;

  return (
    <div className="hud-panel rounded-lg">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div>
          <div className="flex items-center gap-2">
            <h3 className="hud-title text-base font-bold text-white">{businessUnit.name}</h3>
            <StatusBadge status={businessUnit.status} />
          </div>
          {businessUnit.ceo_title && (
            <p className="mt-1 text-xs text-slate-500">{businessUnit.ceo_title}</p>
          )}
        </div>
        <span className="text-xs text-slate-500">
          {businessUnit.departments.length} phòng ban · {totalAgents} agent {open ? "▾" : "▸"}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-4 border-t border-cyan-900/30 px-5 py-4">
          <DepartmentTabs departments={businessUnit.departments} />
          <NetworkView agents={businessUnit.agents} departments={businessUnit.departments} canManage={canManage} />

          {canManage && (
            <div className="border-t border-cyan-900/20 pt-3">
              <button
                type="button"
                onClick={() => setManageOpen((v) => !v)}
                className="text-xs font-medium text-slate-500 transition hover:text-sky-300"
              >
                {manageOpen ? "▾" : "▸"} Quản lý phòng ban &amp; agent
              </button>

              {manageOpen && (
                <div className="mt-3 flex flex-col gap-3">
                  {businessUnit.departments.length === 0 ? (
                    <p className="text-sm text-slate-600">Chưa có phòng ban nào cho công ty con này.</p>
                  ) : (
                    businessUnit.departments.map((dept) => (
                      <DepartmentBlock key={dept.id} department={dept} canManage={canManage} />
                    ))
                  )}
                  <CreateDepartmentForm businessUnitId={businessUnit.id} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CommandCenterTree({
  businessUnits,
  viewerRole,
  viewerBusinessUnitId,
}: {
  businessUnits: BusinessUnitWithTree[];
  viewerRole: UserRole | null;
  viewerBusinessUnitId: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      {businessUnits.map((bu) => {
        const canManage =
          viewerRole === "chairman" || (viewerRole === "ceo" && viewerBusinessUnitId === bu.id);
        return <BusinessUnitCard key={bu.id} businessUnit={bu} canManage={canManage} />;
      })}
    </div>
  );
}
