#!/usr/bin/env node
/**
 * Templates are stored as real files in templates/ (the single source of truth; no string copies in this script).
 *
 * 1. If a template exists but differs from its copy in templates/
 *    (edited without renaming the file), the pipeline fails.
 * 2. If a template is missing (because it was successfully renamed), it is restored from templates/
 *    and .templates-restored is created so the workflow can commit it.
 *
 * To intentionally change a template: node scripts/check-and-restore-templates.mjs --update
 * (copies the visible templates into templates/).
 *
 * Optional: --root <dir> checks a different project directory (for tests).
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";

const args = process.argv.slice(2);
const rootIdx = args.indexOf("--root");
const root = rootIdx >= 0 ? args[rootIdx + 1] : process.cwd();
const update = args.includes("--update");

const templates = [
  { live: "src/content/blog/.new-post.md", source: "templates/new-post.md", rename: ".new-post.md  →  my-new-post.md" },
  { live: "src/pages/.new-section.astro", source: "templates/new-section.astro", rename: ".new-section.astro  →  my-section.astro" },
  { live: "src/pages/.new-feature-page.astro", source: "templates/new-feature-page.astro", rename: ".new-feature-page.astro  →  features.astro" },
  { live: "src/pages/.new-resource-page.astro", source: "templates/new-resource-page.astro", rename: ".new-resource-page.astro  →  resources.astro" },
  { live: "src/pages/footer/.new-footer-section.astro", source: "templates/new-footer-section.astro", rename: ".new-footer-section.astro  →  privacy-policy.astro" },
];

// Ignore line endings and trailing whitespace (Windows checkouts and editor differences).
const norm = (s) => s.replace(/\r\n/g, "\n").trim();
const hash = (s) => createHash("sha256").update(norm(s), "utf8").digest("hex");

let failed = false;
let restored = false;

for (const t of templates) {
  const live = join(root, t.live);
  const source = join(root, t.source);

  if (update) {
    if (!existsSync(live)) {
      console.error(`--update: ${t.live} is missing.`);
      failed = true;
      continue;
    }
    mkdirSync(dirname(source), { recursive: true });
    copyFileSync(live, source);
    console.log(`Updated ${t.source}`);
    continue;
  }

  if (!existsSync(source)) {
    console.error(`ERROR: source ${t.source} is missing (templates are stored in templates/).`);
    failed = true;
    continue;
  }

  if (existsSync(live)) {
    const liveHash = hash(readFileSync(live, "utf8"));
    const sourceHash = hash(readFileSync(source, "utf8"));
    if (liveHash !== sourceHash) {
      const name = t.live.split("/").pop();
      console.error("");
      console.error("════════════════════════════════════════════════════");
      console.error(`  ERROR: You edited ${name},`);
      console.error("  but did NOT rename the file!");
      console.error("");
      console.error("  Rename the file before committing:");
      console.error(`  ${t.rename}`);
      console.error("  (To change the template itself, use --update; see README.)");
      console.error("════════════════════════════════════════════════════");
      console.error("");
      failed = true;
    }
  } else {
    // The template is missing because it was renamed; restore it cleanly.
    mkdirSync(dirname(live), { recursive: true });
    copyFileSync(source, live);
    console.log(`Restored ${t.live}`);
    restored = true;
  }
}

if (failed) process.exit(1);
if (update) process.exit(0);

if (restored) {
  writeFileSync(join(root, ".templates-restored"), "1");
  console.log("Templates were restored – workflow should commit them.");
} else {
  console.log("Templates are clean.");
}
