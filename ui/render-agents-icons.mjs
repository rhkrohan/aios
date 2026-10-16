// Line icons for SIOS Agents (apps/sios-agents), Lucide like the preview, plus
// the coding agents' logos (Claude, OpenAI for Codex, Gemini; Simple Icons, CC0; a pointer for Cursor).
// Run: node ui/render-agents-icons.mjs
import { writeFileSync, copyFileSync } from "node:fs";
import { lucideSvg } from "./lucide-svg.mjs";
const dir = new URL("../apps/sios-agents/src/icons/", import.meta.url).pathname;
for (const name of ["activity", "bot", "check", "clock", "folder-open", "inbox", "octagon-x", "pause", "play", "plus", "shield", "shield-check",
  "sparkles", "square-terminal", "trash-2", "users", "x", "square", "eye", "monitor", "git-branch", "file-pen", "file-plus", "terminal", "search",
  "message-square", "arrow-up", "circle-alert", "circle-check", "triangle-alert", "refresh-cw", "chevron-right", "plug", "cloud", "cpu", "settings"])
  writeFileSync(`${dir}${name}.svg`, await lucideSvg(name, "#000000", 1.8));
for (const logo of ["claude", "openai", "googlegemini"])
  copyFileSync(new URL(`../apps/sios-settings/src/icons/logo-${logo}.svg`, import.meta.url), `${dir}logo-${logo}.svg`);
// Cursor: Simple Icons has no Cursor logo, so a plain pointer (Lucide) stands in
writeFileSync(`${dir}logo-cursor.svg`, await lucideSvg("mouse-pointer-2", "#000000", 1.8));
console.log("agents icons written");
