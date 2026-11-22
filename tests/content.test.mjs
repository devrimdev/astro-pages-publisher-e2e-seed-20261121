import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const repo = process.cwd();
const script = join(repo, "scripts/check-content.mjs");
const starter = readFileSync(join(repo, "src/pages/legal.astro"), "utf8");

function runLegalCheck(source) {
  const root = mkdtempSync(join(tmpdir(), "content-check-"));
  const pageDir = join(root, "src/pages");
  mkdirSync(pageDir, { recursive: true });
  writeFileSync(join(pageDir, "legal.astro"), source);
  const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
  rmSync(root, { recursive: true, force: true });
  return result;
}

test("starter Legal Notice is explicitly incomplete and reported as an editorial warning", () => {
  const result = runLegalCheck(starter);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /intentionally incomplete/i);
  assert.match(result.stdout, /starter placeholder/i);
  assert.match(result.stdout, /prompts found\)/i);
});

test("completed Legal Notice passes only after prompts and starter warning are removed", () => {
  const completed = starter
    .replace('data-legal-status="incomplete"', 'data-legal-status="complete"')
    .replace(/\s*<p class="note note-error legal-status-note"[\s\S]*?<\/p>/, "")
    .replace(/\[(?:REQUIRED[^:\]\r\n]*|IF APPLICABLE):[^\]\r\n]+\]/gi, "Verified operator information");
  const result = runLegalCheck(completed);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /marked complete/i);
  assert.doesNotMatch(result.stderr, /::warning/);
});

test("completed Legal Notice fails while starter prompts remain", () => {
  const completedWithPrompts = starter.replace('data-legal-status="incomplete"', 'data-legal-status="complete"');
  const result = runLegalCheck(completedWithPrompts);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /still contains .* unresolved prompt/i);
});

test("Legal Notice must declare an explicit editorial status", () => {
  const missingStatus = starter.replace('data-legal-status="incomplete"', '');
  const result = runLegalCheck(missingStatus);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Set data-legal-status/);
});
