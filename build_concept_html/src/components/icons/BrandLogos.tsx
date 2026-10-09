"use client";

// Real brand marks from simple-icons (CC0). Slack and OpenAI asked to be removed
// from that set, so they fall back to a monogram. Fine for a private concept;
// check each brand's guidelines before showing this publicly.
import {
  siAnthropic,
  siClaude,
  siGithub,
  siGmail,
  siGooglecalendar,
  siGoogledrive,
  siGooglegemini,
  siHomeassistant,
  siLinear,
  siMeta,
  siNotion,
  type SimpleIcon,
} from "simple-icons";

export const LOGOS = {
  github: siGithub,
  gcal: siGooglecalendar,
  gmail: siGmail,
  drive: siGoogledrive,
  notion: siNotion,
  linear: siLinear,
  homeassistant: siHomeassistant,
  claude: siClaude,
  anthropic: siAnthropic,
  gemini: siGooglegemini,
  meta: siMeta,
} satisfies Record<string, SimpleIcon>;

export type LogoKey = keyof typeof LOGOS;

/** A brand mark on a white app-style tile. */
export function LogoTile({ logo, size = 48, dark = false }: { logo: LogoKey; size?: number; dark?: boolean }) {
  const icon = LOGOS[logo];
  return (
    <span
      className="grid place-items-center shrink-0 shadow-[0_1px_0_rgba(255,255,255,.6)_inset,0_6px_16px_-8px_rgba(0,0,0,.4)]"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.26,
        background: dark ? "linear-gradient(160deg,#2b3038,#121418)" : "linear-gradient(160deg,#ffffff,#f1f3f6)",
        border: dark ? undefined : "1px solid rgba(0,0,0,.07)",
      }}
      title={icon.title}
    >
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" aria-label={icon.title} role="img">
        <path d={icon.path} fill={dark ? "#fff" : `#${icon.hex}`} />
      </svg>
    </span>
  );
}
