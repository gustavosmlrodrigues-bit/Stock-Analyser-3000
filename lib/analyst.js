import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompts.js";
import { dossierForModel } from "./dossier.js";

export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

const MODES = {
  // Quick: answer in 1-2 minutes — few, well-chosen searches.
  quick: { effort: "medium", maxTokens: 16000, searches: 6, fetches: 3 },
  // Deep: full study — read primary documents, take the time it needs.
  deep: { effort: "high", maxTokens: 64000, searches: 30, fetches: 20 },
};

let client = null;
const getClient = () => (client ??= new Anthropic());

/**
 * Run the analysis with live web research, streaming progress through `emit`.
 * emit(event, data) where event ∈ thinking | search | fetch | sources | text | fallback.
 * Returns { markdown, summary, citations, usage, model }.
 */
export async function runAnalysis({ dossier, mode, lang, amountEur, signal }, emit) {
  const cfg = MODES[mode] ?? MODES.quick;
  const user = buildUserPrompt({ dossier: dossierForModel(dossier), mode, lang, amountEur, nowIso: new Date().toISOString() });
  const r = await streamClaude({ system: SYSTEM_PROMPT, user, ...cfg, signal }, emit);
  const { body, summary } = splitSummary(r.markdown);
  return { ...r, markdown: body, summary };
}

/**
 * One Claude turn with web_search + web_fetch, streamed through `emit` and resumed on pause_turn.
 * Returns { markdown, truncated, citations, consulted, model, usage }. Throws code "refusal" on a refusal.
 */
export async function streamClaude({ system, user, effort, maxTokens, searches, fetches, signal }, emit) {
  const messages = [{ role: "user", content: user }];
  let markdown = "";
  const citations = new Map();
  const consulted = new Map();
  let final;

  // Server tools can pause a long turn (stop_reason "pause_turn"): resume by sending the turn back.
  for (let round = 0; round < 6; round++) {
    const stream = getClient().beta.messages.stream(
      {
        model: MODEL,
        max_tokens: maxTokens,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive", display: "summarized" },
        output_config: { effort },
        system,
        tools: [
          { type: "web_search_20260209", name: "web_search", max_uses: searches },
          { type: "web_fetch_20260209", name: "web_fetch", max_uses: fetches },
        ],
        messages,
      },
      { signal },
    );

    const toolInputs = new Map();
    for await (const event of stream) {
      if (event.type === "content_block_start") {
        const b = event.content_block;
        if (b.type === "server_tool_use") toolInputs.set(event.index, { name: b.name, json: "" });
        else if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
          for (const r of b.content) if (r.url) consulted.set(r.url, { url: r.url, title: r.title, pageAge: r.page_age ?? null });
          emit("sources", { count: consulted.size });
        } else if (b.type === "web_fetch_tool_result" && b.content?.url) {
          consulted.set(b.content.url, { url: b.content.url, title: b.content.content?.title ?? b.content.url, pageAge: b.content.retrieved_at ?? null });
          emit("sources", { count: consulted.size });
        } else if (b.type === "fallback") {
          emit("fallback", { from: b.from?.model, to: b.to?.model });
        }
      } else if (event.type === "content_block_delta") {
        const d = event.delta;
        if (d.type === "text_delta") {
          markdown += d.text;
          emit("text", { text: d.text });
        } else if (d.type === "thinking_delta" && d.thinking) {
          emit("thinking", { text: d.thinking });
        } else if (d.type === "input_json_delta" && toolInputs.has(event.index)) {
          toolInputs.get(event.index).json += d.partial_json;
        } else if (d.type === "citations_delta" && d.citation?.url) {
          citations.set(d.citation.url, { url: d.citation.url, title: d.citation.title ?? d.citation.url });
        }
      } else if (event.type === "content_block_stop" && toolInputs.has(event.index)) {
        const t = toolInputs.get(event.index);
        let input = {};
        try {
          input = JSON.parse(t.json || "{}");
        } catch {
          // partial input: show the tool name only
        }
        emit(t.name === "web_fetch" ? "fetch" : "search", { query: input.query ?? input.url ?? null });
      }
    }

    final = await stream.finalMessage();
    if (final.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: final.content });
      continue;
    }
    break;
  }

  if (final.stop_reason === "refusal") {
    const err = new Error("O modelo recusou o pedido.");
    err.code = "refusal";
    err.details = final.stop_details ?? null;
    throw err;
  }

  return {
    markdown,
    truncated: final.stop_reason === "max_tokens",
    citations: [...citations.values()],
    consulted: [...consulted.values()],
    model: final.model,
    usage: final.usage,
  };
}

/** Pull the trailing ```json block off a report. Returns { body, json } (json null when absent or invalid). Exported for tests. */
export function extractJsonBlock(markdown) {
  const m = markdown.match(/```json\s*([\s\S]*?)```\s*$/);
  if (!m) return { body: markdown.trim(), json: null };
  try {
    return { body: markdown.slice(0, m.index).trim(), json: JSON.parse(m[1]) };
  } catch {
    return { body: markdown.trim(), json: null };
  }
}

/** Scores live on a 0-10 scale; anything else becomes null. */
export const clampScore = (n) => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : null);

/** Separate the trailing ```json summary block from the report. Exported for tests. */
export function splitSummary(markdown) {
  const { body, json: summary } = extractJsonBlock(markdown);
  if (summary?.scores) summary.scores = { hold: clampScore(summary.scores.hold), buy: clampScore(summary.scores.buy) };
  return { body, summary };
}
