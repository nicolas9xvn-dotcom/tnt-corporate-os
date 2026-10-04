type BusinessUnitOption = { id: string; name: string };

// Which business unit a dashboard page should show. A ceo/staff user is
// always locked to their own unit (RLS enforces it anyway); a chairman
// (business_unit_id null) can pick one via ?bu=<id>, falling back to the
// first unit by name — the previous behavior, so existing links still land
// on AME29.
export function resolveTargetBusinessUnitId(
  viewerBusinessUnitId: string | null,
  businessUnits: BusinessUnitOption[],
  requestedId: string | undefined
): string | null {
  if (viewerBusinessUnitId) return viewerBusinessUnitId;
  if (requestedId && businessUnits.some((b) => b.id === requestedId)) return requestedId;
  return businessUnits[0]?.id ?? null;
}
