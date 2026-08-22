import { GoogleGenAI, Modality, type Content, type Part } from "@google/genai";
import { createClient } from "@/lib/supabase/server";
import { loadAgentHistory } from "./agent-history";
import { callFallbackProviders, isQuotaError } from "./text-fallback";
import { ATTACHMENTS_BUCKET } from "@/lib/attachments";
import { getScheduleGaps, getRevenueReport } from "@/lib/firebase-tools";
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

type Supabase = NonNullable<Awaited<ReturnType<typeof createClient>>>;

export interface RunnerAgent {
  id: string;
  name: string;
  system_prompt: string;
  house_rules: string | null;
  image_generation: boolean;
  can_read_schedule: boolean;
  can_read_revenue: boolean;
}

// Combines the agent's core system prompt with any standing rule the
// founder set (see house-rules.ts) — house_rules is called out explicitly
// so the model can't quietly drift from it the way it might with something
// buried in rolling task history.
function buildSystemInstruction(agent: RunnerAgent): string {
  if (!agent.house_rules) return agent.system_prompt;
  return `${agent.system_prompt}\n\n--- QUY TẮC CỐ ĐỊNH (bắt buộc tuân theo ở mọi lần trả lời, không tự ý thay đổi) ---\n${agent.house_rules}`;
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

export interface AgentConversationResult {
  output: string;
  delegatedTo: DelegatedResult[];
  generatedImage?: GeneratedImage;
}

async function fetchDirectReports(supabase: Supabase, agentId: string): Promise<RunnerAgent[]> {
  const { data } = await supabase
    .from("agents")
    .select("id, name, system_prompt, house_rules, image_generation, can_read_schedule, can_read_revenue")
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
  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: [
      { text: input },
      ...attachments.map((a) => ({ inlineData: { mimeType: a.mimeType, data: a.base64 } })),
    ],
    config: { systemInstruction, responseModalities: [Modality.TEXT, Modality.IMAGE] },
  });

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
  depth: number;
  budget: DelegationBudget;
}): Promise<AgentConversationResult> {
  const { supabase, userId, agent, input, attachments, taskId, depth, budget } = params;

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

    // Gemini doesn't support mixing a built-in server-side tool
    // (url_context) with custom functionDeclarations in the same call — an
    // agent with any custom tool loses link-reading for that call in
    // exchange; an agent with none of these keeps url_context as before.
    const tools = functionDeclarations.length > 0 ? [{ functionDeclarations }] : [{ urlContext: {} }];

    const delegatedTo: DelegatedResult[] = [];
    let finalText = "";

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      let response: Awaited<ReturnType<typeof ai.models.generateContent>>;
      try {
        response = await ai.models.generateContent({
          model: MODEL,
          contents,
          config: { systemInstruction, maxOutputTokens: MAX_OUTPUT_TOKENS, tools },
        });
      } catch (err) {
        // Only falls back when this call has no custom tools at all (no
        // delegation, no Firebase tools) — the fallback providers below
        // don't implement Gemini's function calling (see text-fallback.ts).
        if (functionDeclarations.length === 0 && isQuotaError(err)) {
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
            responseParts.push({ functionResponse: { name: call.name, response: { output: JSON.stringify(gaps) } } });
          } catch (err) {
            const message = err instanceof Error ? err.message : "Lỗi không xác định.";
            responseParts.push({ functionResponse: { name: call.name, response: { error: message } } });
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
            responseParts.push({ functionResponse: { name: call.name, response: { error: message } } });
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
        const closing = await ai.models.generateContent({
          model: MODEL,
          contents,
          config: { systemInstruction, maxOutputTokens: MAX_OUTPUT_TOKENS },
        });
        finalText = closing.text ?? "";
      }
    }

    await supabase.from("tasks").update({ status: "done", output: finalText }).eq("id", taskId);
    await supabase.from("audit_log").insert({ actor: userId, action: "run_task", target: agent.name, input, output: finalText });
    await supabase.rpc("set_agent_status", { p_agent_id: agent.id, p_status: "idle" });

    return { output: finalText, delegatedTo };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gọi Gemini API thất bại.";
    await supabase.from("tasks").update({ status: "failed", output: message }).eq("id", taskId);
    await supabase.rpc("set_agent_status", { p_agent_id: agent.id, p_status: "error" });
    throw err;
  }
}
