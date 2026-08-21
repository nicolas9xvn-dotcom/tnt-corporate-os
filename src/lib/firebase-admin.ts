import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Read-only bridge into AME29 Nail's real Firebase (the separate booking/
// POS app at ame29-nail.netlify.app — not part of this project). Deliberate
// discipline: this module must only ever call .get() — never .set()/
// .update()/.delete()/.add() — per the founder's own connection doc. The
// service account key has full read/write power regardless of that
// discipline, so it's server-only (FIREBASE_SERVICE_ACCOUNT_KEY), never
// exposed to the browser.
let app: App | null | undefined;

function getFirebaseApp(): App | null {
  if (app !== undefined) return app;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    app = null;
    return app;
  }

  const serviceAccount = JSON.parse(raw);
  app = getApps().length > 0 ? getApps()[0] : initializeApp({ credential: cert(serviceAccount) });
  return app;
}

export function isFirebaseConfigured(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
}

export interface BookingItem {
  id: string;
  staffId: string;
  date: string;
  startMin: number;
  durationMin: number;
  serviceName: string;
  price: number;
  customerName?: string;
  note?: string;
  status: "booked" | "started" | "done" | "cancelled";
}

export interface StaffMember {
  id: string;
  name: string;
}

export interface HistoryEntry {
  staffId: string;
  staffName: string;
  serviceName: string;
  price: number;
  startTime: string;
  endTime: string;
  source?: string;
}

export async function getBookingsForDate(dateStr: string): Promise<BookingItem[]> {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) throw new Error("Chưa cấu hình FIREBASE_SERVICE_ACCOUNT_KEY — xem README.");

  const snap = await getFirestore(firebaseApp).collection("bookings").doc(dateStr).get();
  return snap.exists ? ((snap.data()?.items as BookingItem[]) ?? []) : [];
}

export async function getStaffList(): Promise<StaffMember[]> {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) throw new Error("Chưa cấu hình FIREBASE_SERVICE_ACCOUNT_KEY — xem README.");

  const snap = await getFirestore(firebaseApp).collection("shop").doc("data").get();
  return (snap.data()?.config?.staff as StaffMember[]) ?? [];
}

export async function getHistory(): Promise<HistoryEntry[]> {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) throw new Error("Chưa cấu hình FIREBASE_SERVICE_ACCOUNT_KEY — xem README.");

  const snap = await getFirestore(firebaseApp).collection("shop").doc("data").get();
  return (snap.data()?.history as HistoryEntry[]) ?? [];
}
