// Line icons for SIOS Agents (apps/sios-agents), Lucide like the preview, plus
// the Claude logo (Simple Icons, CC0) for coding agents.
// Run: node ui/render-agents-icons.mjs
import { writeFileSync, copyFileSync } from "node:fs";
import { lucideSvg } from "./lucide-svg.mjs";
const dir = new URL("../apps/sios-agents/src/icons/", import.meta.url).pathname;
for (const name of ["activity", "bot", "check", "clock", "folder-open", "inbox", "octagon-x", "pause", "play", "plus", "shield", "shield-check",
  "sparkles", "square-terminal", "trash-2", "users", "x", "square", "eye", "monitor", "git-branch", "file-pen", "file-plus", "terminal", "search",
  "message-square", "arrow-up", "circle-alert", "circle-check", "triangle-alert", "refresh-cw", "chevron-right", "plug", "cloud", "cpu", "settings"])
  writeFileSync(`${dir}${name}.svg`, await lucideSvg(name, "#000000", 1.8));
copyFileSync(new URL("../apps/sios-settings/src/icons/logo-claude.svg", import.meta.url), `${dir}logo-claude.svg`);
console.log("agents icons written");
