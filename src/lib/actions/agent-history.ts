import type { createClient } from "@/lib/supabase/server";
import type { GeminiTurn } from "@/lib/gemini";

// How many of the agent's most recent completed tasks get replayed as
// conversation history on the next call — bounds token usage/cost while
// still covering a multi-part submission (e.g. a report built up over
// several "Giao việc" rounds).
const HISTORY_LIMIT = 8;

// Loads this agent's recent finished tasks as prior conversation turns, so
// a new task actually remembers what was discussed/produced before instead
// of starting fresh every time (real memory: what the agent read + wrote,
// not the original files — see README for that limitation).
export async function loadAgentHistory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  agentId: string
): Promise<GeminiTurn[]> {
  if (!supabase) return [];

  const { data } = await supabase
    .from("tasks")
    .select("input, output")
    .eq("agent_id", agentId)
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  const rows = (data ?? []).reverse();

  const turns: GeminiTurn[] = [];
  for (const row of rows) {
    if (!row.input || !row.output) continue;
    turns.push({ role: "user", text: row.input });
    turns.push({ role: "model", text: row.output });
  }
  return turns;
}
