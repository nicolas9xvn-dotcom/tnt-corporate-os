"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Picks the best-available Vietnamese voice — setting utterance.lang alone
// is NOT enough on several browsers (notably desktop Chrome): without an
// explicit `voice`, they silently fall back to the default (usually
// English) voice and just mispronounce the Vietnamese text in an English
// accent, which reads as "it's speaking English" even though the language
// tag is correctly "vi-VN". Ranked so the more natural-sounding engines
// (Edge's neural "Natural" voices, then Google's) win over the OS's
// default robotic one, when more than one is installed.
function pickVietnameseVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const viVoices = voices.filter((v) => v.lang.toLowerCase().startsWith("vi"));
  if (viVoices.length === 0) return undefined;
  return (
    viVoices.find((v) => /natural|neural|online/i.test(v.name)) ??
    viVoices.find((v) => /google/i.test(v.name)) ??
    viVoices[0]
  );
}

const SPEED_PRESETS = [1, 1.2, 1.4, 0.85] as const;
const SPEED_STORAGE_KEY = "tnt-tts-rate";

// Free, client-side text-to-speech for agent output — no API cost, no
// backend changes. Falls back to rendering nothing when the browser
// doesn't support the Web Speech API (e.g. some older WebViews).
export function SpeakButton({ text, className }: { text: string; className?: string }) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [noVietnameseVoice, setNoVietnameseVoice] = useState(false);
  // Lazy initializer (not an effect) so this never triggers a second
  // render just to apply the saved preference — safe to read
  // localStorage here since nothing renders until "supported" flips true
  // below, avoiding any server/client markup mismatch.
  const [rate, setRate] = useState<number>(() => {
    if (typeof window === "undefined") return SPEED_PRESETS[0];
    const stored = Number(window.localStorage?.getItem(SPEED_STORAGE_KEY));
    return SPEED_PRESETS.includes(stored as (typeof SPEED_PRESETS)[number]) ? stored : SPEED_PRESETS[0];
  });
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const loadVoices = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };
    // Most browsers (esp. Chrome) return an empty list on the very first
    // call — the real list only arrives async via this event.
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);

    const timer = setTimeout(() => {
      loadVoices();
      setSupported(true);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
      window.speechSynthesis.cancel();
    };
  }, []);

  if (!supported) return null;

  function speak(atRate: number) {
    const synth = window.speechSynthesis;
    synth.cancel();
    // Strip Markdown syntax so it doesn't read out "**", "#", "|" etc.
    const plain = text
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/[#*_`>|-]/g, " ")
      .replace(/\[(.*?)\]\(.*?\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
    const utterance = new SpeechSynthesisUtterance(plain);
    const voice = pickVietnameseVoice(voicesRef.current);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
      setNoVietnameseVoice(false);
    } else {
      // No Vietnamese voice installed on this device at all — lang alone
      // won't fix the accent, so say so instead of pretending it worked.
      utterance.lang = "vi-VN";
      setNoVietnameseVoice(true);
    }
    utterance.rate = atRate;
    utterance.pitch = 1;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    synth.speak(utterance);
    setSpeaking(true);
  }

  function handleClick() {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    speak(rate);
  }

  function cycleSpeed() {
    const next = SPEED_PRESETS[(SPEED_PRESETS.indexOf(rate as (typeof SPEED_PRESETS)[number]) + 1) % SPEED_PRESETS.length];
    setRate(next);
    window.localStorage?.setItem(SPEED_STORAGE_KEY, String(next));
    // Restart with the new rate right away if already speaking, instead
    // of only applying it the next time "Nghe" is pressed.
    if (speaking) speak(next);
  }

  return (
    <span className="inline-flex shrink-0 flex-col items-end gap-1">
      <span className="inline-flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={handleClick}
          className={
            className ??
            "inline-flex shrink-0 items-center gap-1 rounded-md border border-cyan-900/40 px-2 py-0.5 text-[0.65rem] text-cyan-300 hover:border-cyan-600"
          }
        >
          {speaking ? "⏹ Dừng" : "🔊 Nghe"}
        </button>
        <button
          type="button"
          onClick={cycleSpeed}
          title="Đổi tốc độ đọc"
          className="inline-flex shrink-0 items-center rounded-md border border-cyan-900/40 px-2 py-0.5 text-[0.65rem] text-cyan-300 hover:border-cyan-600"
        >
          {rate}x
        </button>
      </span>
      {noVietnameseVoice && (
        <span className="text-right text-[0.6rem] leading-tight text-amber-500/80">
          Máy chưa có giọng đọc tiếng Việt — vào Cài đặt máy để tải thêm.
        </span>
      )}
    </span>
  );
}

const markdownComponents: Components = {
  h1: ({ ...props }) => <h3 className="mt-2 text-sm font-bold text-cyan-200 first:mt-0" {...props} />,
  h2: ({ ...props }) => <h4 className="mt-2 text-sm font-bold text-cyan-200 first:mt-0" {...props} />,
  h3: ({ ...props }) => <h5 className="mt-1.5 text-sm font-semibold text-cyan-200 first:mt-0" {...props} />,
  p: ({ ...props }) => <p className="mt-1.5 leading-relaxed first:mt-0" {...props} />,
  ul: ({ ...props }) => <ul className="mt-1.5 list-disc space-y-1 pl-5" {...props} />,
  ol: ({ ...props }) => <ol className="mt-1.5 list-decimal space-y-1 pl-5" {...props} />,
  li: ({ ...props }) => <li className="leading-relaxed" {...props} />,
  strong: ({ ...props }) => <strong className="font-semibold text-slate-100" {...props} />,
  em: ({ ...props }) => <em className="text-slate-300" {...props} />,
  a: ({ ...props }) => (
    <a className="text-cyan-300 underline hover:text-cyan-200" target="_blank" rel="noreferrer" {...props} />
  ),
  table: ({ ...props }) => (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs" {...props} />
    </div>
  ),
  thead: ({ ...props }) => <thead className="border-b border-slate-700 text-slate-300" {...props} />,
  th: ({ ...props }) => <th className="border border-slate-800 px-2 py-1 text-left font-semibold" {...props} />,
  td: ({ ...props }) => <td className="border border-slate-800 px-2 py-1 align-top" {...props} />,
  code: ({ ...props }) => <code className="rounded bg-slate-900 px-1 py-0.5 text-[0.85em] text-amber-200" {...props} />,
  blockquote: ({ ...props }) => (
    <blockquote className="mt-1.5 border-l-2 border-cyan-800 pl-2 italic text-slate-400" {...props} />
  ),
  hr: () => <hr className="my-2 border-slate-800" />,
};

// Renders agent-authored plain text as formatted Markdown (bold, headings,
// lists, tables) instead of showing raw "**"/"#"/"|" symbols — agents
// already write Markdown (see generate_file / file-generator.ts).
export function MarkdownOutput({ content, className }: { content: string; className?: string }) {
  return (
    <div className={className ?? "text-sm leading-relaxed text-slate-200"}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
