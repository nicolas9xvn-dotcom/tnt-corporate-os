import { GoogleGenAI } from "@google/genai";

// Shared by run-task.ts (auto-run, approval_level 1) and approvals.ts
// (approve/reject flow, approval_level 2/3) so both call the model the
// same way.
export async function callGemini(systemPrompt: string, input: string): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Server chưa cấu hình GEMINI_API_KEY — xem README.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3.6-flash",
    contents: input,
    config: {
      systemInstruction: systemPrompt,
      maxOutputTokens: 4096,
    },
  });

  return response.text ?? "";
}
