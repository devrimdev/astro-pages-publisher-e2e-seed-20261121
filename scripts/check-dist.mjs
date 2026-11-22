#!/usr/bin/env node
// Checks the static build output for required routes and security properties.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { getSiteEnv } from "../src/lib/site-env.mjs";

const root = process.cwd();
const dist = join(root, "dist");
const config = getSiteEnv();
const required = [
  "index.html",
  "repositories/index.html",
  "commits/index.html",
  "getting-started/index.html",
  "how-it-works/index.html",
  "templates/index.html",
  "legal/index.html",
];
const errors = [];

if (!existsSync(dist) || !statSync(dist).isDirectory()) {
  console.error("dist/ is missing. The Astro build has not run or has failed.");
  process.exit(1);
}
for (const file of required) {
  if (!existsSync(join(dist, file))) errors.push(`Required route is missing: ${file}`);
}

// ---------- File types included in the security scan ----------

const TEXT_EXTENSIONS = new Set([
  ".html", ".js", ".mjs", ".cjs", ".json", ".css", ".svg", ".xml",
  ".map", ".txt", ".webmanifest",
]);

/**
 * Secret patterns: detect real tokens and credentials without triggering on
 * harmless public GitHub information (e.g. "github.com/owner/repo")
 * and causing false positives.
 */
const SECRET_PATTERNS = [
  // GitHub fine-grained / classic / OAuth tokens
  { re: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/, label: "GitHub token (ghp_/gho_/ghu_/ghs_/ghr_)" },
  // GitHub fine-grained PAT
  { re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/, label: "GitHub fine-grained PAT" },
  // Explicit GITHUB_TOKEN reference (not as a workflow variable reference)
  { re: /GITHUB_TOKEN\s*[:=]\s*["'][^"']+["']/, label: "hardcoded GITHUB_TOKEN assignment" },
  // Generic API keys / secrets
  { re: /\b(api[_-]?key|api[_-]?secret|access[_-]?token|auth[_-]?token|secret[_-]?key)\s*[:=]\s*["'][A-Za-z0-9+/=_-]{16,}["']/i, label: "API key/secret assignment" },
  // AWS access keys
  { re: /\bAKIA[0-9A-Z]{16}\b/, label: "AWS access key" },
  // Private keys (PEM)
  { re: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/, label: "private key (PEM)" },
  // .env file contents leaked
  { re: /\bSITE_REPOSITORY\s*=\s*[^\s<]+/, label: "leaked SITE_REPOSITORY env variable" },
  { re: /\bSITE_OWNER\s*=\s*[^\s<]+/, label: "leaked SITE_OWNER env variable" },
  { re: /\bSITE_REF\s*=\s*[^\s<]+/, label: "leaked SITE_REF env variable" },
];

const htmlFiles = [];
const textFiles = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full);
    } else {
      const ext = extname(name).toLowerCase();
      if (ext === ".html") htmlFiles.push(full);
      if (TEXT_EXTENSIONS.has(ext)) textFiles.push(full);
    }
  }
}
walk(dist);

// ---------- HTML-specific checks ----------

for (const file of htmlFiles) {
  const source = readFileSync(file, "utf8");
  const path = relative(dist, file).replace(/\\/g, "/");
  const canonical = source.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1];
  if (!canonical) errors.push(`${path}: canonical URL is missing.`);
  else {
    const expectedPrefix = `${config.site}${config.base === "/" ? "/" : `${config.base}/`}`;
    if (!canonical.startsWith(expectedPrefix)) errors.push(`${path}: canonical URL does not use the expected site/base path (${expectedPrefix}).`);
  }
  if (!source.includes('http-equiv="content-security-policy"')) errors.push(`${path}: CSP meta policy is missing.`);
  if (!source.includes("img-src 'self' data: https://avatars.githubusercontent.com")) errors.push(`${path}: avatar origin is missing from img-src.`);
  if (/\sstyle="/.test(source)) errors.push(`${path}: unexpected inline style attribute.`);
}

// ---------- Security scan across all text files ----------

for (const file of textFiles) {
  const source = readFileSync(file, "utf8");
  const path = relative(dist, file).replace(/\\/g, "/");
  for (const { re, label } of SECRET_PATTERNS) {
    if (re.test(source)) {
      errors.push(`${path}: ${label} – potential secret in static output.`);
    }
  }
}

// ---------- Legal Notice ----------

const legalPath = join(dist, "legal/index.html");
if (existsSync(legalPath)) {
  const legal = readFileSync(legalPath, "utf8");
  const status = legal.match(/data-legal-status="(incomplete|complete)"/)?.[1];
  const placeholders = [...legal.matchAll(/\[(?:REQUIRED[^:\]\r\n]*|IF APPLICABLE):[^\]\r\n]+\]/gi)].map((match) => match[0]);
  if (!status) errors.push("Legal Notice must declare data-legal-status as incomplete or complete.");
  if (status === "complete" && placeholders.length) {
    errors.push(`Legal Notice is marked complete but contains unresolved prompts: ${placeholders.join(", ")}.`);
  }
  if (status === "complete" && /Starter template\s*[—-]\s*incomplete|This legal notice is incomplete/i.test(legal)) {
    errors.push("Legal Notice is marked complete but still displays the starter-incomplete warning.");
  }
  if (/Add your legal notice\s*\/\s*imprint here/i.test(legal)) errors.push("Generic Legal Notice placeholder is still present.");
}

if (errors.length) {
  for (const error of errors) console.error(`DIST CHECK FAILED: ${error}`);
  process.exit(1);
}
console.log(`dist check passed: ${htmlFiles.length} HTML files, ${textFiles.length} text files; required routes, CSP, Legal Notice status, and security scan verified.`);
