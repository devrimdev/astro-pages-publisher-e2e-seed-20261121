import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const repo = process.cwd();

function makeDist(files) {
  const root = mkdtempSync(join(tmpdir(), "dist-test-"));
  const dist = join(root, "dist");
  for (const [path, content] of Object.entries(files)) {
    const full = join(dist, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

function runCheck(cwd, env = {}) {
  return spawnSync(process.execPath, [join(repo, "scripts/check-dist.mjs")], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      SITE_REPOSITORY: "testowner/site",
      SITE_OWNER: "testowner",
      SITE_REF: "main",
      ...env,
    },
  });
}

// Minimal valid dist for passing
function validDist() {
  const csp = '<meta http-equiv="content-security-policy" content="img-src \'self\' data: https://avatars.githubusercontent.com">';
  const page = (title) => `<!DOCTYPE html><html><head><link rel="canonical" href="https://testowner.github.io/site/${title}">${csp}</head><body></body></html>`;
  return {
    "index.html": page(""),
    "repositories/index.html": page("repositories/"),
    "commits/index.html": page("commits/"),
    "getting-started/index.html": page("getting-started/"),
    "how-it-works/index.html": page("how-it-works/"),
    "templates/index.html": page("templates/"),
    "legal/index.html": `<!DOCTYPE html><html><head><link rel="canonical" href="https://testowner.github.io/site/legal/">${csp}</head><body><div data-legal-status="incomplete"></div></body></html>`,
  };
}

test("dist check: detects GitHub tokens in JavaScript files", () => {
  const root = makeDist({
    ...validDist(),
    "assets/app.js": 'const token = "ghp_ABCDEFGHIJKLMNOPQRSTuvwx";',
  });
  const r = runCheck(root);
  assert.notEqual(r.status, 0, "should fail");
  assert.match(r.stderr, /GitHub token/i);
  rmSync(root, { recursive: true });
});

test("dist check: detects AWS keys in JSON files", () => {
  const root = makeDist({
    ...validDist(),
    "data/config.json": '{"key": "AKIAIOSFODNN7EXAMPLE"}',
  });
  const r = runCheck(root);
  assert.notEqual(r.status, 0, "should fail");
  assert.match(r.stderr, /AWS access key/i);
  rmSync(root, { recursive: true });
});

test("dist check: detects private keys in CSS files", () => {
  const root = makeDist({
    ...validDist(),
    "assets/style.css": '/* -----BEGIN PRIVATE KEY----- */ body { color: red; }',
  });
  const r = runCheck(root);
  assert.notEqual(r.status, 0, "should fail");
  assert.match(r.stderr, /private key/i);
  rmSync(root, { recursive: true });
});

test("dist check: detects leaked environment variables in SVG files", () => {
  const root = makeDist({
    ...validDist(),
    "assets/icon.svg": '<svg><text>SITE_REPOSITORY=sample-owner/sample-repo</text></svg>',
  });
  const r = runCheck(root);
  assert.notEqual(r.status, 0, "should fail");
  assert.match(r.stderr, /SITE_REPOSITORY/i);
  rmSync(root, { recursive: true });
});

test("dist check: accepts clean output without false positives", () => {
  const root = makeDist(validDist());
  const r = runCheck(root);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /dist check passed/i);
  rmSync(root, { recursive: true });
});

test("dist check: public GitHub URLs do not trigger false positives", () => {
  const root = makeDist({
    ...validDist(),
    "assets/app.js": 'const url = "https://github.com/testowner/site"; const api = "https://api.github.com";',
  });
  const r = runCheck(root);
  assert.equal(r.status, 0, r.stderr);
  rmSync(root, { recursive: true });
});

test("dist check: accepts a completed Legal Notice without starter prompts", () => {
  const files = validDist();
  files["legal/index.html"] = `<!DOCTYPE html><html><head><link rel="canonical" href="https://testowner.github.io/site/legal/">${'<meta http-equiv="content-security-policy" content="img-src \'self\' data: https://avatars.githubusercontent.com">'}</head><body><section data-legal-status="complete"><h1>Legal Notice</h1><p>Verified operator and contact details.</p></section></body></html>`;
  const root = makeDist(files);
  const r = runCheck(root);
  assert.equal(r.status, 0, r.stderr);
  rmSync(root, { recursive: true });
});

test("dist check: rejects a completed Legal Notice with unresolved starter prompts", () => {
  const files = validDist();
  files["legal/index.html"] = files["legal/index.html"].replace('data-legal-status="incomplete"', 'data-legal-status="complete"').replace('</body>', '<p>[REQUIRED: Public contact email address]</p></body>');
  const root = makeDist(files);
  const r = runCheck(root);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /unresolved prompts/i);
  rmSync(root, { recursive: true });
});

test("dist check: rejects a Legal Notice without an explicit status", () => {
  const files = validDist();
  files["legal/index.html"] = files["legal/index.html"].replace('data-legal-status="incomplete"', '');
  const root = makeDist(files);
  const r = runCheck(root);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /must declare data-legal-status/i);
  rmSync(root, { recursive: true });
});
