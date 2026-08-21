import { getBookingsForDate, getStaffList, getHistory } from "./firebase-admin";

// Business hours sourced from the founder's own marketing flyer
// (10:00〜22:00, 最終受付20:00 — last reception 20:00). Adjust here if hours
// change; not read from Firebase since the app doesn't store them.
const OPEN_MIN = 600; // 10:00
const CLOSE_MIN = 1320; // 22:00
const MIN_GAP_MIN = 30; // ignore gaps too short to actually book a service into

function formatTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export interface ScheduleGap {
  staffId: string;
  staffName: string;
  startTime: string;
  endTime: string;
  durationMin: number;
}

// Computed in plain code, not by the model — free/booked interval math is
// exactly the kind of thing an LLM gets subtly wrong, so the agent only
// ever sees the already-correct result of this function.
export async function getScheduleGaps(dateStr: string): Promise<ScheduleGap[]> {
  const [bookings, staff] = await Promise.all([getBookingsForDate(dateStr), getStaffList()]);
  const gaps: ScheduleGap[] = [];

  for (const member of staff) {
    const staffBookings = bookings
      .filter((b) => b.staffId === member.id && b.status !== "cancelled")
      .sort((a, b) => a.startMin - b.startMin);

    const freeIntervals: Array<[number, number]> = [];
    let cursor = OPEN_MIN;
    for (const booking of staffBookings) {
      if (booking.startMin > cursor) freeIntervals.push([cursor, booking.startMin]);
      cursor = Math.max(cursor, booking.startMin + booking.durationMin);
    }
    if (cursor < CLOSE_MIN) freeIntervals.push([cursor, CLOSE_MIN]);

    for (const [start, end] of freeIntervals) {
      if (end - start < MIN_GAP_MIN) continue;
      gaps.push({
        staffId: member.id,
        staffName: member.name,
        startTime: formatTime(start),
        endTime: formatTime(end),
        durationMin: end - start,
      });
    }
  }

  return gaps;
}

export interface RevenueReport {
  fromDate: string;
  toDate: string;
  totalRevenue: number;
  visitCount: number;
  byStaff: Record<string, number>;
  byService: Record<string, number>;
  bySource: Record<string, number>;
}

// Same principle: the sum is computed here, not asked of the model — an
// agent reporting revenue should never be able to make the number up.
export async function getRevenueReport(fromDateStr: string, toDateStr: string): Promise<RevenueReport> {
  const history = await getHistory();
  const rows = history.filter((r) => {
    const day = r.startTime.slice(0, 10);
    return day >= fromDateStr && day <= toDateStr;
  });

  const report: RevenueReport = {
    fromDate: fromDateStr,
    toDate: toDateStr,
    totalRevenue: 0,
    visitCount: rows.length,
    byStaff: {},
    byService: {},
    bySource: {},
  };

  for (const row of rows) {
    const price = row.price || 0;
    report.totalRevenue += price;
    report.byStaff[row.staffName] = (report.byStaff[row.staffName] ?? 0) + price;
    report.byService[row.serviceName] = (report.byService[row.serviceName] ?? 0) + price;
    const source = row.source ?? "other";
    report.bySource[source] = (report.bySource[source] ?? 0) + price;
  }

  return report;
}
