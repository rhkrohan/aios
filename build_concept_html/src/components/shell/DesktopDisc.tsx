"use client";

// A desktop folder as a disc (see icons/FolderDisc). Hover lights the rings and
// says what's inside; double-click opens it; drag it onto the orb to ask.

import { useState } from "react";
import { useOS } from "@/lib/store";
import { FolderDisc, discStats, discSummary } from "../icons/FolderDisc";

export function DesktopDisc({ label, path, photo, onOpen }: { label: string; path: string; photo?: string; onOpen: () => void }) {
  const items = useOS((s) => s.fs[path]);
  const folderId = useOS((s) => s.fs["~"]?.find((x) => x.name === label)?.id);
  const [hover, setHover] = useState(false);
  const summary = discSummary(discStats(items ?? []));

  return (
    <button
      onDoubleClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      draggable={!!folderId}
      onDragStart={(e) => {
        if (!folderId) return;
        e.dataTransfer.setData("application/x-sios", JSON.stringify([{ id: folderId, dir: "~" }]));
        e.dataTransfer.effectAllowed = "copyMove";
      }}
      aria-label={`${label}: ${summary}`}
      className="group relative w-[100px] flex flex-col items-center py-1.5 outline-none"
    >
      {/* real frosted glass: the wallpaper behind the disc is blurred and brightened */}
      <span className="rounded-full backdrop-blur-md backdrop-saturate-150 backdrop-brightness-110 shadow-[0_10px_24px_-10px_rgba(10,20,40,.55)] group-focus-visible:ring-2 group-focus-visible:ring-white/80">
        <FolderDisc path={path} name={label} size={74} photo={photo} open={hover} />
      </span>
      <span className="mt-1.5 text-[13px] font-semibold px-1.5 rounded-md text-white [text-shadow:0_1px_3px_rgba(0,0,0,.55)] group-focus-visible:bg-accent group-focus-visible:[text-shadow:none]">
        {label}
      </span>
      <span className="text-[11.5px] text-white/80 [text-shadow:0_1px_3px_rgba(0,0,0,.55)] max-w-[100px] truncate">
        {hover ? summary : `${items?.length ?? 0} items`}
      </span>
    </button>
  );
}
