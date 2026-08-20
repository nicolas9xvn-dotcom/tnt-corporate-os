// Shared types for talking to Gemini — the actual generateContent calls
// live in agent-runner.ts (runAgentConversation), which needs the fuller
// multi-round/function-calling loop that a single callGemini() couldn't
// support once agent-to-agent delegation was added.

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
