"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Free, client-side text-to-speech for agent output — no API cost, no
// backend changes. Falls back to rendering nothing when the browser
// doesn't support the Web Speech API (e.g. some older WebViews).
export function SpeakButton({ text, className }: { text: string; className?: string }) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    }, 0);
    return () => {
      clearTimeout(timer);
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  if (!supported) return null;

  function handleClick() {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    synth.cancel();
    // Strip Markdown syntax so it doesn't read out "**", "#", "|" etc.
    const plain = text
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/[#*_`>|-]/g, " ")
      .replace(/\[(.*?)\]\(.*?\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
    const utterance = new SpeechSynthesisUtterance(plain);
    utterance.lang = "vi-VN";
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    utteranceRef.current = utterance;
    synth.speak(utterance);
    setSpeaking(true);
  }

  return (
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
