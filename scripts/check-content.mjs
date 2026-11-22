#!/usr/bin/env node
// Editorial completeness is an explicit operator decision; never invent legal details.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const legalFile = "src/pages/legal.astro";
const legal = readFileSync(join(root, legalFile), "utf8");
const status = legal.match(/data-legal-status="([^"]+)"/)?.[1];
const placeholders = [...legal.matchAll(/\[(?:REQUIRED[^:\]\r\n]*|IF APPLICABLE):[^\]\r\n]+\]/gi)].map((match) => match[0]);
const incompleteCopy = /Starter template\s*[—-]\s*incomplete|This legal notice is incomplete/i.test(legal);

if (status !== "incomplete" && status !== "complete") {
  console.error(`::error file=${legalFile}::Set data-legal-status to either "incomplete" or "complete".`);
  process.exitCode = 1;
} else if (status === "incomplete") {
  console.warn(`::warning file=${legalFile}::The Legal Notice is intentionally incomplete; operator details and jurisdiction-specific review are still required before publication.`);
  console.log(`Editorial check: Legal Notice remains an explicit starter placeholder (${placeholders.length} prompts found).`);
} else {
  if (placeholders.length > 0) {
    console.error(`::error file=${legalFile}::The Legal Notice is marked complete but still contains ${placeholders.length} unresolved prompt(s): ${placeholders.join(", ")}`);
    process.exitCode = 1;
  }
  if (incompleteCopy) {
    console.error(`::error file=${legalFile}::Remove the starter-incomplete warning when marking the Legal Notice complete.`);
    process.exitCode = 1;
  }
  if (!process.exitCode) console.log("Editorial check: Legal Notice is marked complete and contains no starter prompts. Legal accuracy still requires operator review.");
}
