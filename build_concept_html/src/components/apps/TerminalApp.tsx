"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { BRAND } from "@/lib/brand";
import { useOS } from "@/lib/store";
import { COMMANDS, completions, tokenize, type Ctx, type Line, type Tone } from "@/lib/terminal/commands";
import type { Win } from "@/lib/types";

const TONE: Record<Tone, string> = {
  out: "text-[#d7dae0]",
  dim: "text-[#7c8088]",
  ok: "text-[#94c29a]",
  warn: "text-[#e5b567]",
  err: "text-[#e8787a]",
  dir: "text-[#8fb3d9]",
  accent: "text-[#a9bdff]",
  bold: "text-white font-semibold",
};

interface Row {
  id: number;
  line: Line;
}

let rowId = 0;
const toLine = (l: Line | string): Line => (typeof l === "string" ? [{ text: l }] : l);

export function TerminalApp({ win }: { win: Win }) {
  const closeWindow = useOS((s) => s.closeWindow);
  const [cwd, setCwd] = useState(win.props?.path ?? "~");
  const [rows, setRows] = useState<Row[]>(() => [
    { id: rowId++, line: [{ text: `${BRAND.name} terminal. `, tone: "bold" }, { text: "Type ", tone: "dim" }, { text: "help", tone: "accent" }, { text: " to see commands, or ", tone: "dim" }, { text: 'sios ask "..."', tone: "accent" }, { text: " to give the assistant a task.", tone: "dim" }] },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [hIndex, setHIndex] = useState<number | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cwdRef = useRef(cwd);
  useEffect(() => {
    cwdRef.current = cwd;
  }, [cwd]);

  const user = BRAND.user.toLowerCase();
  const prompt = (dir: string): Line => [
    { text: `${user}@${BRAND.device}`, tone: "ok" },
    { text: ":", tone: "out" },
    { text: dir, tone: "dir" },
    { text: "$ ", tone: "out" },
  ];

  const print = (l: Line | string) => setRows((r) => [...r, { id: rowId++, line: toLine(l) }].slice(-1500));

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [rows, busy]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const run = async (raw: string) => {
    const line = raw.trim();
    print([...prompt(cwd), { text: raw }]);
    if (!line) return;
    const nextHistory = [...history, line].slice(-200);
    setHistory(nextHistory);
    setHIndex(null);
    const [name, ...args] = tokenize(line);
    const cmd = COMMANDS[name];
    if (!cmd) {
      print([{ text: `${name}: command not found. `, tone: "err" }, { text: "Try ", tone: "dim" }, { text: "help", tone: "accent" }, { text: " or ", tone: "dim" }, { text: `sios ask "${line}"`, tone: "accent" }]);
      return;
    }
    const ctx: Ctx = {
      cwd,
      setCwd: (p) => {
        cwdRef.current = p;
        setCwd(p);
      },
      print,
      clear: () => setRows([]),
      close: () => closeWindow(win.id),
      history: nextHistory,
      onCancel: (fn) => {
        cancelRef.current = fn;
      },
    };
    try {
      const out = cmd.run(args, ctx);
      if (out instanceof Promise) {
        setBusy(true);
        await out;
      }
    } catch (e) {
      print([{ text: `${name}: ${String(e)}`, tone: "err" }]);
    } finally {
      cancelRef.current = null;
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const complete = () => {
    const words = tokenize(input);
    const endsWithSpace = /\s$/.test(input);
    if (words.length <= 1 && !endsWithSpace) {
      const hits = Object.keys(COMMANDS).filter((c) => c.startsWith(words[0] ?? ""));
      if (hits.length === 1) setInput(hits[0] + " ");
      else if (hits.length > 1) print([{ text: hits.join("  "), tone: "dim" }]);
      return;
    }
    if (words[0] === "sios" && words.length <= 2 && !endsWithSpace) {
      const subs = ["ask", "goals", "audit", "trust", "leases", "explain", "stop", "resume", "whoami"].filter((x) => x.startsWith(words[1] ?? ""));
      if (subs.length === 1) setInput(`sios ${subs[0]} `);
      else if (subs.length > 1) print([{ text: subs.join("  "), tone: "dim" }]);
      return;
    }
    const partial = endsWithSpace ? "" : words[words.length - 1] ?? "";
    const hits = completions(cwdRef.current, partial.replace(/^"/, ""));
    if (!hits.length) return;
    const head = endsWithSpace ? input : input.slice(0, input.length - partial.length);
    if (hits.length === 1) {
      setInput(head + hits[0] + (hits[0].endsWith("/") ? "" : " "));
      return;
    }
    // extend to the longest common prefix, and show the options
    let common = hits[0];
    for (const h of hits) while (!h.toLowerCase().startsWith(common.toLowerCase())) common = common.slice(0, -1);
    if (common.length > partial.length) setInput(head + common);
    print([{ text: hits.join("  "), tone: "dim" }]);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey && e.key.toLowerCase() === "c") {
      e.preventDefault();
      if (busy && cancelRef.current) {
        cancelRef.current();
        return;
      }
      print([...prompt(cwd), { text: input }, { text: "^C", tone: "dim" }]);
      setInput("");
      return;
    }
    if (e.ctrlKey && e.key.toLowerCase() === "l") {
      e.preventDefault();
      setRows([]);
      return;
    }
    if (busy) return;
    if (e.key === "Enter") {
      e.preventDefault();
      const value = input;
      setInput("");
      void run(value);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!history.length) return;
      const i = hIndex === null ? history.length - 1 : Math.max(0, hIndex - 1);
      setHIndex(i);
      setInput(history[i]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (hIndex === null) return;
      const i = hIndex + 1;
      if (i >= history.length) {
        setHIndex(null);
        setInput("");
      } else {
        setHIndex(i);
        setInput(history[i]);
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      complete();
    }
  };

  return (
    <div
      ref={scrollRef}
      onClick={() => {
        if (!window.getSelection()?.toString()) inputRef.current?.focus();
      }}
      className="h-full bg-[#15171a] font-mono text-[12.5px] leading-[1.65] px-4 py-3 overflow-auto scroll-thin cursor-text"
    >
      {rows.map((r) => (
        <div key={r.id} className="whitespace-pre-wrap break-words min-h-[1.65em]">
          {r.line.map((seg, i) => (
            <span key={i} className={TONE[seg.tone ?? "out"]}>
              {seg.text}
            </span>
          ))}
        </div>
      ))}
      <div className={clsx("flex items-center whitespace-pre", busy && "opacity-60")}>
        {!busy &&
          prompt(cwd).map((seg, i) => (
            <span key={i} className={TONE[seg.tone ?? "out"]}>
              {seg.text}
            </span>
          ))}
        {busy && <span className={TONE.dim}>(running, Ctrl+C to stop following) </span>}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          aria-label="Terminal input"
          className="flex-1 min-w-0 bg-transparent outline-none border-0 p-0 text-[#d7dae0] caret-[#d7dae0] font-mono text-[12.5px]"
        />
      </div>
    </div>
  );
}
