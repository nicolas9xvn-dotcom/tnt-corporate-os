// Chairman-only tab row for pages scoped to one business unit (e.g. AME29 vs
// MỀU Studio). Renders nothing for ceo/staff or when there's only one unit.
export function BusinessUnitSwitcher({
  basePath,
  businessUnits,
  currentId,
  locked,
}: {
  basePath: string;
  businessUnits: { id: string; name: string }[];
  currentId: string;
  locked: boolean;
}) {
  if (locked || businessUnits.length < 2) return null;

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {businessUnits.map((unit) => (
        <a
          key={unit.id}
          href={`${basePath}?bu=${unit.id}`}
          className={
            unit.id === currentId
              ? "rounded-full bg-cyan-400 px-3 py-1 text-xs font-semibold text-slate-950"
              : "rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400 transition hover:border-cyan-400 hover:text-cyan-300"
          }
        >
          {unit.name}
        </a>
      ))}
    </div>
  );
}
