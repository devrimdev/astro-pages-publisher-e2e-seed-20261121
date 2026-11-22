#!/usr/bin/env node
/**
 * Generates navigation from the pages that exist:
 *   - src/content/nav.json     main navigation (src/pages/*.astro)
 *   - src/content/footer.json  footer links (src/pages/footer/*.astro)
 * Dotfiles (the reusable templates) and underscore-prefixed files are ignored.
 */

import { existsSync, readdirSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";

const rootArg = process.argv.indexOf("--root");
const root = rootArg >= 0 ? process.argv[rootArg + 1] : process.cwd();
const pagesDir = join(root, "src", "pages");
const footerDir = join(pagesDir, "footer");
const outDir = join(root, "src", "content");

function toLabel(file) {
  return basename(file, ".astro")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function pageFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".astro") && !f.startsWith(".") && !f.startsWith("_"));
}

// Keep the core product guides ahead of the live GitHub data examples.
const preferredOrder = ["index.astro", "getting-started.astro", "how-it-works.astro", "templates.astro", "commits.astro", "repositories.astro"];
const preferredLabels = {
  "index.astro": "Overview",
  "getting-started.astro": "Getting Started",
  "how-it-works.astro": "How It Works",
  "templates.astro": "Templates",
  "commits.astro": "Commits",
  "repositories.astro": "Repositories",
};
const excludeFromNav = new Set(["legal.astro"]);
const pages = pageFiles(pagesDir)
  .filter((file) => !excludeFromNav.has(file))
  .sort((a, b) => {
    const ai = preferredOrder.indexOf(a);
    const bi = preferredOrder.indexOf(b);
    if (ai >= 0 || bi >= 0) return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi);
    return a.localeCompare(b);
  });

const nav = pages.map((file) => ({
  label: preferredLabels[file] || toLabel(file),
  href: file === "index.astro" ? "/" : "/" + basename(file, ".astro"),
}));

const footer = pageFiles(footerDir)
  .sort()
  .map((file) => ({
    label: toLabel(file),
    href: "/footer/" + basename(file, ".astro"),
  }));

mkdirSync(outDir, { recursive: true });
function writeIfChanged(path, value) {
  const content = JSON.stringify(value, null, 2) + "\n";
  if (existsSync(path) && readFileSync(path, "utf8") === content) {
    console.log(`${path.replace(root + "/", "")}: unchanged`);
    return false;
  }
  writeFileSync(path, content);
  console.log(`${path.replace(root + "/", "")}: generated`);
  return true;
}

const navChanged = writeIfChanged(join(outDir, "nav.json"), nav);
const footerChanged = writeIfChanged(join(outDir, "footer.json"), footer);
console.log(`Navigation generation complete (changed: ${navChanged || footerChanged}).`);
