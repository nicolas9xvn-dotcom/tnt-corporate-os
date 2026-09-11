import { JWT } from "google-auth-library";
import { drive, drive_v3 } from "@googleapis/drive";

// Folder names exactly as specified by the founder (supabase/migrations/
// 0029 stores the category as a short enum; this maps it back to the real
// Drive folder name). "01 NAIL" is the only category split into per-month
// subfolders — everything else is one flat folder.
export const INBOX_FOLDER_NAME = "00 INBOX";
export const REVIEW_FOLDER_NAME = "99 REVIEW";
export const CATEGORY_FOLDER_NAMES: Record<string, string> = {
  NAIL: "01 NAIL",
  PARTS_CHARM: "02 PARTS & CHARM",
  SALON: "03 SALON",
  PROCESS: "04 PROCESS",
  PEOPLE: "05 PEOPLE",
  CUSTOMER: "06 CUSTOMER",
  BRAND_MOOD: "07 BRAND & MOOD",
};

export interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  md5Checksum: string | null;
  createdTime: string;
}

let cachedClient: drive_v3.Drive | null = null;

// Service Account auth — the account itself never needs Google Workspace;
// it just needs to be shared (as Editor) on the founder's own "AME29 PHOTO
// LIBRARY" folder in a regular personal Google Drive, exactly like sharing
// a folder with any other person's email. Key JSON lives only in
// GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY (Vercel env var) — same handling
// discipline as FIREBASE_SERVICE_ACCOUNT_KEY elsewhere in this project.
function getDriveClient(): drive_v3.Drive {
  if (cachedClient) return cachedClient;

  const rawKey = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY;
  if (!rawKey) {
    throw new Error("Chưa cấu hình GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY — xem README.");
  }
  const credentials = JSON.parse(rawKey) as { client_email: string; private_key: string };

  const auth = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  cachedClient = drive({ version: "v3", auth });
  return cachedClient;
}

function escapeForDriveQuery(value: string): string {
  return value.replace(/'/g, "\\'");
}

// Drive doesn't expose a nice "find child folder by name" call — this is
// just files.list scoped to 1 parent + exact name + folder mimeType.
async function findChildFolder(parentId: string, name: string): Promise<string | null> {
  const client = getDriveClient();
  const res = await client.files.list({
    q: `'${parentId}' in parents and name = '${escapeForDriveQuery(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name)",
    pageSize: 1,
  });
  return res.data.files?.[0]?.id ?? null;
}

async function createChildFolder(parentId: string, name: string): Promise<string> {
  const client = getDriveClient();
  const res = await client.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id",
  });
  if (!res.data.id) throw new Error(`Không tạo được thư mục "${name}" trên Drive.`);
  return res.data.id;
}

// Finds a subfolder, creating it if missing — used both for the fixed
// category folders (already exist, per the founder's own setup) and for
// per-month "2026.09" folders under "01 NAIL", which DO need to be created
// automatically as new months roll around (per the founder's spec — no
// manual folder creation expected from staff).
export async function ensureChildFolder(parentId: string, name: string): Promise<string> {
  const existing = await findChildFolder(parentId, name);
  if (existing) return existing;
  return createChildFolder(parentId, name);
}

// Lists files directly inside the INBOX folder — new uploads only, not
// anything the pipeline has already moved out. `sinceIso` lets a cron run
// skip files an earlier run already saw (belt-and-suspenders alongside the
// drive_file_id uniqueness check in Postgres).
export async function listInboxFiles(inboxFolderId: string, sinceIso?: string): Promise<DriveFileInfo[]> {
  const client = getDriveClient();
  const timeFilter = sinceIso ? ` and createdTime > '${sinceIso}'` : "";
  const res = await client.files.list({
    q: `'${inboxFolderId}' in parents and trashed = false${timeFilter}`,
    fields: "files(id, name, mimeType, md5Checksum, createdTime)",
    orderBy: "createdTime",
    pageSize: 100,
  });
  return (res.data.files ?? []).map((f) => ({
    id: f.id as string,
    name: f.name as string,
    mimeType: f.mimeType as string,
    md5Checksum: f.md5Checksum ?? null,
    createdTime: f.createdTime as string,
  }));
}

export async function downloadFileBuffer(fileId: string): Promise<Buffer> {
  const client = getDriveClient();
  const res = await client.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
  return Buffer.from(res.data as ArrayBuffer);
}

// Moves a file from one folder to another (Drive files can have multiple
// parents, so this is add+remove, not a rename) — used both for the normal
// "classified → correct category folder" path and for "low confidence →
// 99 REVIEW".
export async function moveFile(fileId: string, fromFolderId: string, toFolderId: string): Promise<void> {
  const client = getDriveClient();
  await client.files.update({
    fileId,
    addParents: toFolderId,
    removeParents: fromFolderId,
    fields: "id, parents",
  });
}
