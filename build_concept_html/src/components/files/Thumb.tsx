"use client";

// A real preview where we can: your imported photos, photo-like thumbnails for
// the built-in images, otherwise the typed file icon.

import clsx from "clsx";
import { ShieldAlert } from "lucide-react";
import { getBlob } from "@/lib/blobs";
import type { FileItem } from "@/lib/types";
import { childPath } from "@/lib/fileops";
import { FolderDisc } from "../icons/FolderDisc";
import { FileIcon } from "../icons/Icons";

const PHOTOS = ["/wallpapers/dusk.jpg", "/wallpapers/lake.jpg"];
const hash = (s: string) => Array.from(s).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export function Thumb({ item, size, count, dir }: { item: FileItem; size: number; count?: number; dir?: string }) {
  const blob = item.imported ? getBlob(item.id) : undefined;
  const badge = (
    <>
      {item.trust === "untrusted" && (
        <span title="From the web or email" className="absolute -bottom-0.5 -right-0.5 size-[18px] rounded-full grid place-items-center bg-warn text-white ring-2 ring-surface">
          <ShieldAlert size={10} />
        </span>
      )}
      {item.touchedBy && <span title="Changed by AI" className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-ai ring-2 ring-surface" />}
    </>
  );

  if (item.kind === "folder") {
    return (
      <span className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
        <FolderDisc path={dir ? childPath(dir, item.name) : undefined} name={item.name} size={Math.round(size * 0.9)} tone="surface" locked={item.labels?.includes("Sensitive")} />
        {count !== undefined && count > 0 && size >= 48 && (
          <span className="absolute bottom-0 right-0 min-w-5 h-5 px-1.5 rounded-full bg-surface text-[10.5px] font-semibold text-fg-2 grid place-items-center shadow-sm ring-1 ring-line tabular-nums">
            {count}
          </span>
        )}
        {badge}
      </span>
    );
  }

  if (item.kind === "image") {
    const src = blob?.url ?? PHOTOS[hash(item.name) % PHOTOS.length];
    const pos = `${hash(item.name) % 100}% ${hash(item.id) % 100}%`;
    return (
      <span className="relative inline-block" style={{ width: size, height: size }}>
        <span
          className={clsx("absolute inset-[8%] rounded-[10%] overflow-hidden ring-1 ring-black/10 shadow-[0_4px_10px_-4px_rgba(0,0,0,.35)] bg-surface-3")}
          style={{ backgroundImage: `url(${src})`, backgroundSize: blob ? "cover" : "260%", backgroundPosition: blob ? "center" : pos }}
        />
        {badge}
      </span>
    );
  }

  return (
    <span className="relative inline-block" style={{ width: size, height: size }}>
      <FileIcon kind={item.kind} name={item.name} size={size} />
      {badge}
    </span>
  );
}
