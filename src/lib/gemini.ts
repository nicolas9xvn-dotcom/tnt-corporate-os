import { GoogleGenAI } from "@google/genai";

export interface GeminiAttachment {
  mimeType: string;
  base64: string;
}

// One earlier turn of the conversation with this agent — a past task's
// input and the output it produced — replayed so the model actually
// remembers prior tasks instead of starting fresh every time.
export interface GeminiTurn {
  role: "user" | "model";
  text: string;
}

// Shared by run-task.ts (auto-run, approval_level 1) and approvals.ts
// (approve/reject flow, approval_level 2/3) so both call the model the
// same way. `url_context` lets Gemini fetch a website the user pastes into
// the task text itself; `attachments` are inline files (images, PDF, ...)
// only available on the immediate-run path — see run-task.ts. `history` is
// this agent's recent past tasks, oldest first — see loadAgentHistory.
export async function callGemini(
  systemPrompt: string,
  input: string,
  attachments: GeminiAttachment[] = [],
  history: GeminiTurn[] = []
): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Server chưa cấu hình GEMINI_API_KEY — xem README.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3.6-flash",
    contents: [
      ...history.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
      {
        role: "user",
        parts: [
          { text: input },
          ...attachments.map((a) => ({ inlineData: { mimeType: a.mimeType, data: a.base64 } })),
        ],
      },
    ],
    config: {
      systemInstruction: systemPrompt,
      maxOutputTokens: 4096,
      tools: [{ urlContext: {} }],
    },
  });

  return response.text ?? "";
}
