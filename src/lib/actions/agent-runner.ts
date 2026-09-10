import { GoogleGenAI, Modality, type Content, type Part } from "@google/genai";
import { createClient } from "@/lib/supabase/server";
import { loadAgentHistory } from "./agent-history";
import { callFallbackProviders, isQuotaError } from "./text-fallback";
import { ATTACHMENTS_BUCKET, sanitizeFileName } from "@/lib/attachments";
import { getScheduleGaps, getRevenueReport } from "@/lib/firebase-tools";
import { getCompetitorData, COMPETITOR_TOPICS } from "@/lib/competitor-tools";
import { generateFile, FILE_FORMAT_EXTENSIONS, FILE_FORMAT_MIME_TYPES, type FileFormat } from "@/lib/file-generator";
import type { GeminiAttachment } from "@/lib/gemini";

const MODEL = "gemini-3.6-flash";
const MAX_OUTPUT_TOKENS = 4096;
// Gemini's own native image-output model — free tier (same GEMINI_API_KEY as
// text), not verified live (this sandbox can't reach the API). Override via
// GEMINI_IMAGE_MODEL if this name is stale by the time you're reading this,
// same situation the project already hit once with the text model name.
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

// How many reports_to hops deep a task can cascade (executive -> director
// -> manager -> specialist is 4 levels in the current AME29 org chart) and
// how many total delegated sub-tasks one top-level "Giao việc" can spawn
// across the whole cascade — both exist purely to bound Gemini API calls
// (cost + free-tier rate limits), not because deeper/wider delegation is
// unsafe in principle.
export const MAX_DELEGATION_DEPTH = 4;
export const MAX_DELEGATIONS_PER_REQUEST = 6;

// Rounds of (call Gemini -> maybe delegate -> feed results back) per agent
// level before forcing a plain-text final answer. 2 covers the common case
// (decide once, synthesize once) without letting one level loop forever.
const MAX_TOOL_ROUNDS = 2;

// Gemini occasionally returns 503 UNAVAILABLE ("This model is currently
// experiencing high demand... usually temporary") — a transient server
// overload, completely different from running out of quota (429, handled
// by the DeepSeek/Grok/OpenAI fallback below). An agent that can delegate
// never reaches that fallback (see hasRealTools below), so without this a
// brief Google-side spike fails the whole task outright even though
// retrying seconds later would just work. Real error shape from the SDK is
// unconfirmed (this sandbox can't reach the API), so this checks both a
// possible top-level status and the stringified message text.
function isOverloadedError(err: unknown): boolean {
  const status = (err as { status?: number | string })?.status;
  if (status === 503 || status === "UNAVAILABLE") return true;
  const message = err instanceof Error ? err.message : String(err);
  return /"code"\s*:\s*503|UNAVAILABLE|overloaded|high demand/i.test(message);
}

async function withOverloadRetry<T>(fn: () => Promise<T>, retries = 2, baseDelayMs = 1500): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !isOverloadedError(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (attempt + 1)));
    }
  }
}

interface CoordinationCheck {
  stopped: boolean;
  interjections: string[];
}

// Checked once per tool-calling round (2 cheap selects) so a founder
// watching "Phòng họp" can redirect or halt a delegation chain without a
// background worker — the whole chain already runs inside one synchronous
// request/recursion, so polling the DB between rounds is enough to react
// within a round or two. Only one recursion frame is ever actively running
// at a time (delegate_to_agent awaits its subordinate before continuing),
// so whichever agent is "on stage" right now is the one that picks up a
// fresh stop flag or founder message for this session.
async function checkCoordination(supabase: Supabase, rootTaskId: string): Promise<CoordinationCheck> {
  const [{ data: rootTask }, { data: pending }] = await Promise.all([
    supabase.from("tasks").select("stop_requested").eq("id", rootTaskId).maybeSingle(),
    supabase
      .from("task_messages")
      .select("id, text")
      .eq("root_task_id", rootTaskId)
      .is("consumed_at", null)
      .order("created_at", { ascending: true }),
  ]);

  if (pending && pending.length > 0) {
    await supabase
      .from("task_messages")
      .update({ consumed_at: new Date().toISOString() })
      .in(
        "id",
        pending.map((m) => m.id)
      );
  }

  return { stopped: rootTask?.stop_requested === true, interjections: (pending ?? []).map((m) => m.text) };
}

type Supabase = NonNullable<Awaited<ReturnType<typeof createClient>>>;

export interface RunnerAgent {
  id: string;
  name: string;
  system_prompt: string;
  house_rules: string | null;
  image_generation: boolean;
  can_read_schedule: boolean;
  can_read_revenue: boolean;
  can_read_competitors: boolean;
  business_unit_id: string;
}

// Combines the agent's core system prompt with any standing rule the
// founder set (see house-rules.ts) — house_rules is called out explicitly
// so the model can't quietly drift from it the way it might with something
// buried in rolling task history.
function buildSystemInstruction(agent: RunnerAgent): string {
  let instruction = agent.system_prompt;

  if (agent.house_rules) {
    instruction += `\n\n--- QUY TẮC CỐ ĐỊNH (bắt buộc tuân theo ở mọi lần trả lời, không tự ý thay đổi) ---\n${agent.house_rules}`;
  }

  // Rolling history (agent-history.ts) replays this agent's own past
  // answers as prior conversation turns — including any past answer about
  // schedule/revenue that was wrong (a bug, a stale Firebase error, or a
  // hallucination) but got saved as "done" anyway. Without this, the model
  // treats its own earlier wrong answer as established fact and stays
  // "consistent" with it instead of re-checking reality.
  if (agent.can_read_schedule || agent.can_read_revenue) {
    instruction += `\n\n--- DỮ LIỆU THẬT, KHÔNG ĐƯỢC BỊA ---\nBạn có thể gọi hàm để đọc dữ liệu lịch hẹn/doanh thu THẬT từ Firebase của salon. Với MỌI câu hỏi liên quan đến lịch làm việc, giờ trống, hay doanh thu: luôn gọi lại hàm tương ứng để lấy số liệu MỚI NHẤT cho câu hỏi hiện tại — tuyệt đối không dùng lại tên nhân viên, giờ giấc, hay số liệu đã từng nói trong các lượt hội thoại trước đó, kể cả do chính bạn nói trước đây (có thể lúc đó là do lỗi hoặc câu trả lời sai). Nếu hàm báo lỗi hoặc trả về danh sách rỗng, PHẢI nói thẳng với người dùng là không lấy được dữ liệu thật lúc này — tuyệt đối không tự đoán hay dựng ra tên người/khung giờ/số tiền không có trong kết quả hàm trả về.`;
  }

  if (agent.can_read_competitors) {
    instruction += `\n\n--- DỮ LIỆU ĐỐI THỦ THẬT, KHÔNG ĐƯỢC BỊA ---\nBạn có thể gọi hàm get_competitor_data để đọc dữ liệu khảo sát đối thủ THẬT (233 tiệm nail Nhật Bản, tổng hợp từ Google Maps/Hotpepper/Instagram/TikTok/Minimo do founder tự thu thập). Với MỌI câu hỏi về đối thủ, giá thị trường, hay định vị cạnh tranh: luôn gọi hàm này để lấy đúng số liệu — tuyệt đối không tự bịa tên tiệm, giá, rating, hay số review. Đây là dữ liệu khảo sát tại MỘT THỜI ĐIỂM (không phải real-time) — khi trả lời, có thể ghi rõ là "theo dữ liệu khảo sát", không khẳng định đây là giá/rating hiện tại của đối thủ ngay lúc này.`;
  }

  return instruction;
}

export interface DelegationBudget {
  remaining: number;
}

export interface DelegatedResult {
  agentName: string;
  output: string;
}

export interface GeneratedImage {
  mimeType: string;
  base64: string;
}

export interface GeneratedFile {
  path: string;
  name: string;
}

export interface AgentConversationResult {
  output: string;
  delegatedTo: DelegatedResult[];
  generatedImage?: GeneratedImage;
  generatedFile?: GeneratedFile;
}

async function fetchDirectReports(supabase: Supabase, agentId: string): Promise<RunnerAgent[]> {
  const { data } = await supabase
    .from("agents")
    .select(
      "id, name, system_prompt, house_rules, image_generation, can_read_schedule, can_read_revenue, can_read_competitors, business_unit_id"
    )
    .eq("reports_to", agentId)
    .not("system_prompt", "is", null);

  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    system_prompt: r.system_prompt as string,
    house_rules: r.house_rules,
    image_generation: r.image_generation,
    can_read_schedule: r.can_read_schedule,
    can_read_revenue: r.can_read_revenue,
    can_read_competitors: r.can_read_competitors,
    business_unit_id: r.business_unit_id,
  }));
}

// Generates a real image via Gemini's native image output — used only for
// agents flagged image_generation (see migration 0013). Throws if the model
// doesn't return an image part at all (e.g. a stale/wrong IMAGE_MODEL name).
async function generateAgentImage(
  ai: GoogleGenAI,
  systemInstruction: string,
  input: string,
  attachments: GeminiAttachment[]
): Promise<{ text: string; image: GeneratedImage }> {
  const response = await withOverloadRetry(() =>
    ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: [
        { text: input },
        ...attachments.map((a) => ({ inlineData: { mimeType: a.mimeType, data: a.base64 } })),
      ],
      config: { systemInstruction, responseModalities: [Modality.TEXT, Modality.IMAGE] },
    })
  );

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.data);
  const text = parts.find((p) => p.text)?.text ?? response.text ?? "";

  if (!imagePart?.inlineData?.data) {
    throw new Error(
      `Model tạo ảnh (${IMAGE_MODEL}) không trả về ảnh nào — có thể tên model đã đổi, kiểm tra biến môi trường GEMINI_IMAGE_MODEL.`
    );
  }

  return {
    text,
    image: { mimeType: imagePart.inlineData.mimeType ?? "image/png", base64: imagePart.inlineData.data },
  };
}

// Runs one agent's turn on an EXISTING task row — the caller already
// created/updated it (see run-task.ts / approvals.ts) — and, if that agent
// has direct reports and the shared delegation budget still allows it,
// lets it hand part of the work to the right subordinate via Gemini
// function calling, recursively. Owns that row's final status/output, the
// agent's live "running" status (for the neon pulse in network-view.tsx),
// and the audit log entry — for this task AND every sub-task it spawns.
export async function runAgentConversation(params: {
  supabase: Supabase;
  userId: string;
  agent: RunnerAgent;
  input: string;
  attachments: GeminiAttachment[];
  taskId: string;
  // Id of the original top-level task that started this whole delegation
  // chain (== taskId itself when depth is 0) — lets "Phòng họp" group every
  // sub-task under one session, and lets the founder's stop/interject
  // controls (see task 0024) target the whole chain instead of 1 agent.
  rootTaskId: string;
  depth: number;
  budget: DelegationBudget;
}): Promise<AgentConversationResult> {
  const { supabase, userId, agent, input, attachments, taskId, rootTaskId, depth, budget } = params;

  await supabase.rpc("set_agent_status", { p_agent_id: agent.id, p_status: "running" });

  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("Server chưa cấu hình GEMINI_API_KEY — xem README.");
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const systemInstruction = buildSystemInstruction(agent);

    if (agent.image_generation) {
      const { text, image } = await generateAgentImage(ai, systemInstruction, input, attachments);
      const imagePath = `${taskId}/generated.png`;
      const { error: uploadError } = await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .upload(imagePath, Buffer.from(image.base64, "base64"), { contentType: image.mimeType, upsert: true });
      const finalText = text || "Đã tạo ảnh mới.";

      await supabase
        .from("tasks")
        .update({ status: "done", output: finalText, output_image_path: uploadError ? null : imagePath })
        .eq("id", taskId);
      await supabase.from("audit_log").insert({ actor: userId, action: "run_task", target: agent.name, input, output: finalText });
      await supabase.rpc("set_agent_status", { p_agent_id: agent.id, p_status: "idle" });

      return { output: finalText, delegatedTo: [], generatedImage: image };
    }

    const directReports = depth < MAX_DELEGATION_DEPTH ? await fetchDirectReports(supabase, agent.id) : [];
    const canDelegate = directReports.length > 0 && budget.remaining > 0;
    const history = await loadAgentHistory(supabase, agent.id);

    const contents: Content[] = [
      ...history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
      {
        role: "user",
        parts: [
          { text: input },
          ...attachments.map((a) => ({ inlineData: { mimeType: a.mimeType, data: a.base64 } })),
        ],
      },
    ];

    const functionDeclarations = [];
    if (canDelegate) {
      functionDeclarations.push({
        name: "delegate_to_agent",
        description:
          "Giao một phần việc cụ thể, rõ ràng cho đúng 1 agent cấp dưới trực tiếp phù hợp nhất. Gọi nhiều lần nếu cần giao cho nhiều agent khác nhau. Nếu tự làm được, không cần gọi hàm này.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            agent_name: {
              type: "string",
              enum: directReports.map((r) => r.name),
              description: "Tên chính xác của agent cấp dưới trực tiếp sẽ nhận việc",
            },
            instructions: { type: "string", description: "Nội dung công việc cụ thể giao cho agent đó" },
          },
          required: ["agent_name", "instructions"],
        },
      });
    }
    if (agent.can_read_schedule) {
      functionDeclarations.push({
        name: "get_schedule_gaps",
        description:
          "Đọc lịch hẹn THẬT từ app đặt lịch của salon (Firebase) và trả về đúng các khung giờ trống thật của từng nhân viên trong 1 ngày cụ thể — số liệu đã tính sẵn, không tự suy đoán thêm.",
        parametersJsonSchema: {
          type: "object",
          properties: { date: { type: "string", description: "Ngày cần xem, định dạng YYYY-MM-DD" } },
          required: ["date"],
        },
      });
    }
    if (agent.can_read_revenue) {
      functionDeclarations.push({
        name: "get_revenue_report",
        description:
          "Đọc dữ liệu doanh thu THẬT (các lượt dịch vụ đã hoàn thành) từ app của salon (Firebase) trong 1 khoảng ngày cụ thể — số liệu đã tính sẵn, không tự suy đoán thêm.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            from_date: { type: "string", description: "Ngày bắt đầu, YYYY-MM-DD" },
            to_date: { type: "string", description: "Ngày kết thúc, YYYY-MM-DD" },
          },
          required: ["from_date", "to_date"],
        },
      });
    }
    if (agent.can_read_competitors) {
      functionDeclarations.push({
        name: "get_competitor_data",
        description:
          "Đọc dữ liệu khảo sát đối thủ & giá THẬT (233 tiệm nail Nhật Bản, tổng hợp từ Google Maps/Hotpepper/Instagram/TikTok/Minimo) do founder tự thu thập — số liệu đã có sẵn, không tự suy đoán thêm.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            topic: {
              type: "string",
              enum: COMPETITOR_TOPICS,
              description:
                "tong_quan: điểm mạnh/yếu vs trung bình thị trường + đề xuất hành động + so sánh giá theo mô hình. doi_thu_truc_tiep: hồ sơ chi tiết đa nền tảng của các đối thủ gần AME29 nhất (khu Daikokucho, gồm cả AME29). bang_xep_hang_osaka: bảng xếp hạng ~45 tiệm nổi bật ở Osaka. doi_thu_toan_quoc: top tiệm cao cấp toàn quốc để tham khảo phân khúc giá cao.",
            },
          },
          required: ["topic"],
        },
      });
    }
    // Available to every agent unconditionally (not gated behind a
    // can_generate_files flag like the tools above) — any task can turn
    // into "gửi cho tôi file Excel/PDF/Word" and there's no good way to
    // predict in advance which agent will need it.
    functionDeclarations.push({
      name: "generate_file",
      description:
        "Tạo 1 file thật (Excel/PDF/Word) để người dùng tải về, khi công việc cần xuất ra dạng file/bảng cụ thể thay vì chỉ trả lời bằng chữ. Chỉ gọi khi người giao việc có yêu cầu xuất file hoặc dữ liệu dạng bảng — không tự ý tạo file nếu chỉ cần trả lời ngắn gọn bằng chữ.",
      parametersJsonSchema: {
        type: "object",
        properties: {
          format: { type: "string", enum: ["xlsx", "pdf", "docx"], description: "xlsx = Excel/bảng tính, pdf = PDF, docx = Word" },
          filename: { type: "string", description: "Tên file, không kèm phần đuôi (VD: bao-cao-doanh-thu-thang-8)" },
          title: { type: "string", description: "Tiêu đề hiển thị đầu file/sheet" },
          content: {
            type: "string",
            description:
              "Nội dung dạng Markdown đơn giản: dòng bắt đầu bằng '# ' hoặc '## ' là tiêu đề, dòng thường là đoạn văn, bảng viết theo cú pháp Markdown pipe table (| Cột 1 | Cột 2 |\\n|---|---|\\n| a | b |). Với file Excel, phần bảng trong nội dung sẽ thành các dòng/cột thật trong sheet.",
          },
        },
        required: ["format", "filename", "title", "content"],
      },
    });

    // Gemini doesn't support mixing a built-in server-side tool
    // (url_context) with custom functionDeclarations in the same call — now
    // that generate_file is always present, every non-image-generation
    // agent always has custom tools, so url_context (link-reading) is
    // permanently traded away in exchange.
    const tools = [{ functionDeclarations }];

    const delegatedTo: DelegatedResult[] = [];
    let finalText = "";
    let generatedFile: GeneratedFile | undefined;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const coordination = await checkCoordination(supabase, rootTaskId);
      if (coordination.stopped) {
        finalText = "(Đã dừng theo yêu cầu điều phối viên trong Phòng họp.)";
        await supabase.from("tasks").update({ status: "rejected", output: finalText }).eq("id", taskId);
        await supabase.rpc("set_agent_status", { p_agent_id: agent.id, p_status: "idle" });
        return { output: finalText, delegatedTo };
      }
      for (const message of coordination.interjections) {
        contents.push({ role: "user", parts: [{ text: `[Điều phối viên bổ sung giữa chừng]: ${message}` }] });
      }

      let response: Awaited<ReturnType<typeof ai.models.generateContent>>;
      try {
        response = await withOverloadRetry(() =>
          ai.models.generateContent({
            model: MODEL,
            contents,
            config: { systemInstruction, maxOutputTokens: MAX_OUTPUT_TOKENS, tools },
          })
        );
      } catch (err) {
        // Falls back whenever the agent has none of the "real" tools (no
        // delegation, no Firebase/competitor data reads) — generate_file is
        // deliberately excluded from this check since it's present on every
        // agent now: losing file-generation for one answer is an acceptable
        // degradation while Gemini's quota is out, versus never falling
        // back at all. The fallback providers below don't implement
        // Gemini's function calling either way (see text-fallback.ts).
        const hasRealTools = canDelegate || agent.can_read_schedule || agent.can_read_revenue || agent.can_read_competitors;
        if (!hasRealTools && isQuotaError(err)) {
          const fallback = await callFallbackProviders(systemInstruction, history, input, attachments);
          finalText = `${fallback.text}\n\n[Gemini hết quota — câu trả lời này đến từ ${fallback.provider} thay thế.]`;
          break;
        }
        throw err;
      }

      const calls = response.functionCalls ?? [];
      if (calls.length === 0) {
        finalText = response.text ?? "";
        break;
      }

      // Use the real response parts (not the flattened `calls` array) so any
      // thoughtSignature Gemini attached to a functionCall part is echoed
      // back verbatim — omitting it makes the next call fail with "Function
      // call is missing a thought_signature" (400 INVALID_ARGUMENT).
      const modelParts = response.candidates?.[0]?.content?.parts ?? calls.map((c) => ({ functionCall: c }));
      contents.push({ role: "model", parts: modelParts });
      const responseParts: Part[] = [];

      for (const call of calls) {
        if (call.name === "get_schedule_gaps") {
          const date = String(call.args?.date ?? "");
          try {
            const gaps = await getScheduleGaps(date);
            const output =
              gaps.length > 0
                ? JSON.stringify(gaps)
                : "Không có khung giờ trống nào — nói thẳng với người dùng là không có, không tự bịa ra khung giờ.";
            responseParts.push({ functionResponse: { name: call.name, response: { output } } });
          } catch (err) {
            const message = err instanceof Error ? err.message : "Lỗi không xác định.";
            responseParts.push({
              functionResponse: {
                name: call.name,
                response: {
                  error: `KHÔNG lấy được dữ liệu lịch thật (${message}). Báo lỗi này thẳng cho người dùng — TUYỆT ĐỐI không tự bịa tên nhân viên hay khung giờ trống.`,
                },
              },
            });
          }
          continue;
        }

        if (call.name === "get_revenue_report") {
          const fromDate = String(call.args?.from_date ?? "");
          const toDate = String(call.args?.to_date ?? "");
          try {
            const report = await getRevenueReport(fromDate, toDate);
            responseParts.push({ functionResponse: { name: call.name, response: { output: JSON.stringify(report) } } });
          } catch (err) {
            const message = err instanceof Error ? err.message : "Lỗi không xác định.";
            responseParts.push({
              functionResponse: {
                name: call.name,
                response: {
                  error: `KHÔNG lấy được dữ liệu doanh thu thật (${message}). Báo lỗi này thẳng cho người dùng — TUYỆT ĐỐI không tự bịa số liệu.`,
                },
              },
            });
          }
          continue;
        }

        if (call.name === "get_competitor_data") {
          const topic = String(call.args?.topic ?? "");
          try {
            const data = await getCompetitorData(supabase, agent.business_unit_id, topic);
            responseParts.push({ functionResponse: { name: call.name, response: { output: JSON.stringify(data) } } });
          } catch (err) {
            const message = err instanceof Error ? err.message : "Lỗi không xác định.";
            responseParts.push({
              functionResponse: {
                name: call.name,
                response: {
                  error: `KHÔNG lấy được dữ liệu đối thủ (${message}). Báo lỗi này thẳng cho người dùng — TUYỆT ĐỐI không tự bịa tên tiệm, giá, hay rating.`,
                },
              },
            });
          }
          continue;
        }

        if (call.name === "generate_file") {
          const format = String(call.args?.format ?? "") as FileFormat;
          const filename = sanitizeFileName(String(call.args?.filename ?? "file"));
          const title = String(call.args?.title ?? "");
          const content = String(call.args?.content ?? "");
          try {
            if (!(format in FILE_FORMAT_EXTENSIONS)) {
              throw new Error(`Định dạng "${format}" không hợp lệ — chỉ chấp nhận xlsx, pdf, docx.`);
            }
            const buffer = await generateFile(format, title, content);
            const ext = FILE_FORMAT_EXTENSIONS[format];
            const storagePath = `${taskId}/generated-${filename}.${ext}`;
            const { error: uploadError } = await supabase.storage
              .from(ATTACHMENTS_BUCKET)
              .upload(storagePath, buffer, { contentType: FILE_FORMAT_MIME_TYPES[format], upsert: true });
            if (uploadError) throw new Error(uploadError.message);
            generatedFile = { path: storagePath, name: `${filename}.${ext}` };
            responseParts.push({
              functionResponse: { name: call.name, response: { output: `Đã tạo file "${filename}.${ext}" thành công.` } },
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : "Lỗi không xác định.";
            responseParts.push({
              functionResponse: { name: call.name, response: { error: `KHÔNG tạo được file (${message}). Báo lỗi này cho người dùng.` } },
            });
          }
          continue;
        }

        const targetName = String(call.args?.agent_name ?? "");
        const instructions = String(call.args?.instructions ?? "").trim();
        const target = directReports.find((r) => r.name === targetName);

        if (!target || !instructions) {
          responseParts.push({
            functionResponse: {
              name: call.name,
              response: { error: `Không giao được cho "${targetName}" — thiếu nội dung hoặc không đúng tên agent cấp dưới.` },
            },
          });
          continue;
        }
        if (budget.remaining <= 0) {
          responseParts.push({
            functionResponse: {
              name: call.name,
              response: { error: "Đã đạt giới hạn số lần giao việc trong 1 yêu cầu — tự hoàn thành phần còn lại." },
            },
          });
          continue;
        }
        budget.remaining -= 1;

        const { data: subTaskRow, error: subInsertError } = await supabase
          .from("tasks")
          .insert({
            agent_id: target.id,
            created_by: userId,
            title: instructions.slice(0, 80),
            status: "in_progress",
            input: instructions,
            parent_task_id: taskId,
            root_task_id: rootTaskId,
          })
          .select("id")
          .single();

        if (subInsertError || !subTaskRow) {
          responseParts.push({
            functionResponse: {
              name: call.name,
              response: { error: `Không tạo được task cho "${target.name}": ${subInsertError?.message ?? ""}` },
            },
          });
          continue;
        }

        try {
          const subResult = await runAgentConversation({
            supabase,
            userId,
            agent: target,
            input: instructions,
            attachments: [],
            taskId: subTaskRow.id,
            rootTaskId,
            depth: depth + 1,
            budget,
          });
          delegatedTo.push({ agentName: target.name, output: subResult.output }, ...subResult.delegatedTo);
          responseParts.push({ functionResponse: { name: call.name, response: { output: subResult.output } } });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Gọi Gemini API thất bại.";
          responseParts.push({ functionResponse: { name: call.name, response: { error: message } } });
        }
      }

      contents.push({ role: "user", parts: responseParts });

      if (round === MAX_TOOL_ROUNDS - 1) {
        const closing = await withOverloadRetry(() =>
          ai.models.generateContent({
            model: MODEL,
            contents,
            config: { systemInstruction, maxOutputTokens: MAX_OUTPUT_TOKENS },
          })
        );
        finalText = closing.text ?? "";
      }
    }

    await supabase
      .from("tasks")
      .update({
        status: "done",
        output: finalText,
        output_file_path: generatedFile?.path ?? null,
        output_file_name: generatedFile?.name ?? null,
      })
      .eq("id", taskId);
    await supabase.from("audit_log").insert({ actor: userId, action: "run_task", target: agent.name, input, output: finalText });
    await supabase.rpc("set_agent_status", { p_agent_id: agent.id, p_status: "idle" });

    return { output: finalText, delegatedTo, generatedFile };
  } catch (err) {
    const message = isOverloadedError(err)
      ? "Gemini đang quá tải tạm thời (lỗi từ phía Google, đã tự thử lại nhưng vẫn chưa được) — thử giao lại việc này sau vài phút."
      : err instanceof Error
        ? err.message
        : "Gọi Gemini API thất bại.";
    await supabase.from("tasks").update({ status: "failed", output: message }).eq("id", taskId);
    await supabase.rpc("set_agent_status", { p_agent_id: agent.id, p_status: "error" });
    throw err;
  }
}
