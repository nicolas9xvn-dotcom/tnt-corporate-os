import {
  Boxes,
  Compass,
  Landmark,
  Megaphone,
  Palette,
  Scale,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import type { Department } from "@/lib/types";

interface DepartmentVisual {
  Icon: LucideIcon;
  glow: string;
  ring: string;
  iconColor: string;
  face: string;
}

const VISUALS: Record<string, DepartmentVisual> = {
  OPERATIONS: {
    Icon: Settings2,
    glow: "shadow-[0_0_18px_-4px_rgba(52,211,153,0.55)]",
    ring: "ring-emerald-400/40",
    iconColor: "text-emerald-300",
    face: "from-emerald-500/25 via-emerald-500/10 to-emerald-950/60",
  },
  FINANCE: {
    Icon: Landmark,
    glow: "shadow-[0_0_18px_-4px_rgba(251,191,36,0.55)]",
    ring: "ring-amber-400/40",
    iconColor: "text-amber-300",
    face: "from-amber-500/25 via-amber-500/10 to-amber-950/60",
  },
  ADMIN_LEGAL: {
    Icon: Scale,
    glow: "shadow-[0_0_18px_-4px_rgba(167,139,250,0.55)]",
    ring: "ring-violet-400/40",
    iconColor: "text-violet-300",
    face: "from-violet-500/25 via-violet-500/10 to-violet-950/60",
  },
  MARKETING: {
    Icon: Megaphone,
    glow: "shadow-[0_0_18px_-4px_rgba(56,189,248,0.55)]",
    ring: "ring-sky-400/40",
    iconColor: "text-sky-300",
    face: "from-sky-500/25 via-sky-500/10 to-sky-950/60",
  },
  BRAND_DESIGN: {
    Icon: Palette,
    glow: "shadow-[0_0_18px_-4px_rgba(244,114,182,0.55)]",
    ring: "ring-pink-400/40",
    iconColor: "text-pink-300",
    face: "from-pink-500/25 via-pink-500/10 to-pink-950/60",
  },
  MANAGEMENT: {
    Icon: Compass,
    glow: "shadow-[0_0_18px_-4px_rgba(129,140,248,0.55)]",
    ring: "ring-indigo-400/40",
    iconColor: "text-indigo-300",
    face: "from-indigo-500/25 via-indigo-500/10 to-indigo-950/60",
  },
};

const FALLBACK: DepartmentVisual = {
  Icon: Boxes,
  glow: "shadow-[0_0_18px_-4px_rgba(148,163,184,0.45)]",
  ring: "ring-slate-400/30",
  iconColor: "text-slate-300",
  face: "from-slate-500/25 via-slate-500/10 to-slate-950/60",
};

function getVisual(department: Pick<Department, "code" | "name">): DepartmentVisual {
  const key = department.code?.toUpperCase().replace(/[^A-Z]/g, "_");
  return (key && VISUALS[key]) || FALLBACK;
}

const SIZE = {
  sm: { block: "h-8 w-8 rounded-lg", icon: 17 },
  md: { block: "h-14 w-14 rounded-xl", icon: 26 },
} as const;

export function DepartmentIcon({
  department,
  size = "md",
}: {
  department: Pick<Department, "code" | "name">;
  size?: keyof typeof SIZE;
}) {
  const { Icon, glow, ring, iconColor, face } = getVisual(department);
  const dims = SIZE[size];

  return (
    <span
      className={`relative flex shrink-0 items-center justify-center bg-gradient-to-br ${face} ${dims.block} ${glow} ring-1 ${ring}`}
    >
      <span className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-b from-white/15 to-transparent" />
      <Icon size={dims.icon} className={`relative ${iconColor}`} strokeWidth={2.25} />
    </span>
  );
}

export function DepartmentTabs({ departments }: { departments: Department[] }) {
  if (departments.length === 0) return null;

  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {departments.map((dept) => (
        <div
          key={dept.id}
          className="flex shrink-0 flex-col items-center gap-1.5 rounded-lg px-1 py-1 text-center"
        >
          <DepartmentIcon department={dept} size="md" />
          <span className="max-w-[5.5rem] truncate text-xs font-medium text-slate-400">
            {dept.name}
          </span>
        </div>
      ))}
    </div>
  );
}
