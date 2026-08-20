import OpenAI from "openai";
import type { GeminiAttachment, GeminiTurn } from "@/lib/gemini";

// DeepSeek and xAI (Grok) both publish OpenAI-compatible chat endpoints, so
// one client covers all three providers — just a different baseURL/key/model
// per provider. Tried in this order (cheapest-first) only when the agent
// has NO direct reports: an agent that can delegate needs Gemini's function
// calling, which isn't implemented against these APIs (see agent-runner.ts).
//
// Model names below are best-effort guesses, not verified live (this
// sandbox can't reach these APIs) — same situation the project already hit
// once with Gemini's own model name drifting. Override via the *_MODEL env
// vars below if a provider rejects the default with a "model not found"
// style error.
interface FallbackProvider {
  id: string;
  apiKeyEnv: string;
  baseURL?: string;
  modelEnv: string;
  defaultModel: string;
  supportsImages: boolean;
}

const FALLBACK_PROVIDERS: FallbackProvider[] = [
  {
    id: "DeepSeek",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    baseURL: "https://api.deepseek.com",
    modelEnv: "DEEPSEEK_MODEL",
    defaultModel: "deepseek-chat",
    supportsImages: false,
  },
  {
    id: "Grok",
    apiKeyEnv: "GROK_API_KEY",
    baseURL: "https://api.x.ai/v1",
    modelEnv: "GROK_MODEL",
    defaultModel: "grok-4",
    supportsImages: true,
  },
  {
    id: "OpenAI",
    apiKeyEnv: "OPENAI_API_KEY",
    baseURL: undefined,
    modelEnv: "OPENAI_MODEL",
    defaultModel: "gpt-4o-mini",
    supportsImages: true,
  },
];

// Only fall back on a real "out of quota / rate limited" error — anything
// else (bad prompt, server bug) should surface as a normal failure instead
// of silently masking it by trying another provider.
export function isQuotaError(err: unknown): boolean {
  if (!err) return false;
  const status = (err as { status?: number })?.status;
  if (status === 429) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /quota|rate.?limit|resource_exhausted|too many requests/i.test(message);
}

type UserContentPart = OpenAI.Chat.Completions.ChatCompletionContentPart;

export async function callFallbackProviders(
  systemPrompt: string,
  history: GeminiTurn[],
  input: string,
  attachments: GeminiAttachment[]
): Promise<{ text: string; provider: string }> {
  const errors: string[] = [];
  let triedAny = false;

  for (const provider of FALLBACK_PROVIDERS) {
    const apiKey = process.env[provider.apiKeyEnv];
    if (!apiKey) continue;
    triedAny = true;

    try {
      const client = new OpenAI({ apiKey, baseURL: provider.baseURL });
      const model = process.env[provider.modelEnv] || provider.defaultModel;

      const skipped: string[] = [];
      const userContent: UserContentPart[] = [{ type: "text", text: input }];
      for (const a of attachments) {
        if (provider.supportsImages && a.mimeType.startsWith("image/")) {
          userContent.push({ type: "image_url", image_url: { url: `data:${a.mimeType};base64,${a.base64}` } });
        } else {
          skipped.push(a.mimeType);
        }
      }
      if (skipped.length > 0) {
        userContent[0] = {
          type: "text",
          text: `${input}\n\n[${provider.id} không đọc được ${skipped.length} file đính kèm không phải ảnh trong lượt dự phòng này.]`,
        };
      }

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        ...history.map(
          (t): OpenAI.Chat.ChatCompletionMessageParam => ({
            role: t.role === "model" ? "assistant" : "user",
            content: t.text,
          })
        ),
        { role: "user", content: userContent },
      ];

      const response = await client.chat.completions.create({ model, messages, max_tokens: 4096 });
      const text = response.choices[0]?.message?.content ?? "";
      if (!text) throw new Error(`${provider.id} không trả về nội dung.`);

      return { text, provider: provider.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Lỗi không xác định.";
      errors.push(`${provider.id}: ${message}`);
    }
  }

  if (!triedAny) {
    throw new Error(
      "Gemini hết quota và chưa cấu hình model dự phòng nào (DEEPSEEK_API_KEY / GROK_API_KEY / OPENAI_API_KEY) — xem README."
    );
  }
  throw new Error(`Gemini hết quota, và tất cả model dự phòng đều lỗi:\n${errors.join("\n")}`);
}
