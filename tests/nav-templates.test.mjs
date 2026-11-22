import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, cpSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const repo = process.cwd();
const run = (script, args) => spawnSync(process.execPath, [join(repo, "scripts", script), ...args], { encoding: "utf8" });

function tmp() {
  return mkdtempSync(join(tmpdir(), "site-test-"));
}

test("navigation: new repository pages and custom sections are discovered automatically", () => {
  const root = tmp();
  const pages = join(root, "src/pages");
  mkdirSync(join(pages, "footer"), { recursive: true });
  for (const f of ["index", "legal", "commits", "repositories", "getting-started", "how-it-works", "templates", "my-section", "_hidden", ".new-section"]) {
    writeFileSync(join(pages, `${f}.astro`), "---\n---\n");
  }
  writeFileSync(join(pages, "footer/privacy-notice.astro"), "---\n---\n");
  writeFileSync(join(pages, "footer/.new-footer-section.astro"), "---\n---\n");

  const r = run("generate-nav.mjs", ["--root", root]);
  assert.equal(r.status, 0, r.stderr);
  const nav = JSON.parse(readFileSync(join(root, "src/content/nav.json"), "utf8"));
  assert.deepEqual(nav, [
    { label: "Overview", href: "/" },
    { label: "Getting Started", href: "/getting-started" },
    { label: "How It Works", href: "/how-it-works" },
    { label: "Templates", href: "/templates" },
    { label: "Commits", href: "/commits" },
    { label: "Repositories", href: "/repositories" },
    { label: "My Section", href: "/my-section" },
  ]);
  const footer = JSON.parse(readFileSync(join(root, "src/content/footer.json"), "utf8"));
  assert.deepEqual(footer, [{ label: "Privacy Notice", href: "/footer/privacy-notice" }]);
  const navPath = join(root, "src/content/nav.json");
  const before = statSync(navPath).mtimeMs;
  const again = run("generate-nav.mjs", ["--root", root]);
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /nav\.json: unchanged/);
  assert.equal(statSync(navPath).mtimeMs, before, "unchanged navigation is not rewritten");
  rmSync(root, { recursive: true });
});

function projectCopy() {
  const root = tmp();
  for (const d of ["templates", "src/pages", "src/content/blog"]) mkdirSync(join(root, d), { recursive: true });
  cpSync(join(repo, "templates"), join(root, "templates"), { recursive: true });
  cpSync(join(repo, "src/pages/.new-section.astro"), join(root, "src/pages/.new-section.astro"));
  cpSync(join(repo, "src/pages/.new-feature-page.astro"), join(root, "src/pages/.new-feature-page.astro"));
  cpSync(join(repo, "src/pages/.new-resource-page.astro"), join(root, "src/pages/.new-resource-page.astro"));
  mkdirSync(join(root, "src/pages/footer"), { recursive: true });
  cpSync(join(repo, "src/pages/footer/.new-footer-section.astro"), join(root, "src/pages/footer/.new-footer-section.astro"));
  cpSync(join(repo, "src/content/blog/.new-post.md"), join(root, "src/content/blog/.new-post.md"));
  return root;
}
const check = (root, ...extra) => run("check-and-restore-templates.mjs", ["--root", root, ...extra]);

test("templates: unchanged copies are clean", () => {
  const root = projectCopy();
  const r = check(root);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!existsSync(join(root, ".templates-restored")));
});

test("templates: editing without renaming causes the pipeline to fail", () => {
  const root = projectCopy();
  const f = join(root, "src/pages/.new-feature-page.astro");
  writeFileSync(f, readFileSync(f, "utf8") + "\n<!-- edit -->\n");
  const r = check(root);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /did NOT rename/);
  assert.match(r.stderr, /features\.astro/);
});

test("templates: renamed files are restored byte-for-byte", () => {
  const root = projectCopy();
  rmSync(join(root, "src/pages/.new-section.astro"));
  rmSync(join(root, "src/pages/.new-feature-page.astro"));
  rmSync(join(root, "src/pages/.new-resource-page.astro"));
  rmSync(join(root, "src/pages/footer/.new-footer-section.astro"));
  rmSync(join(root, "src/content/blog/.new-post.md"));
  const r = check(root);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(root, ".templates-restored")));
  for (const [live, src] of [
    ["src/pages/.new-section.astro", "templates/new-section.astro"],
    ["src/pages/.new-feature-page.astro", "templates/new-feature-page.astro"],
    ["src/pages/.new-resource-page.astro", "templates/new-resource-page.astro"],
    ["src/pages/footer/.new-footer-section.astro", "templates/new-footer-section.astro"],
    ["src/content/blog/.new-post.md", "templates/new-post.md"],
  ]) {
    assert.ok(readFileSync(join(root, live)).equals(readFileSync(join(root, src))), live);
  }
});

test("templates: --update copies an intentionally changed template into templates/", () => {
  const root = projectCopy();
  const f = join(root, "src/pages/.new-section.astro");
  writeFileSync(f, readFileSync(f, "utf8") + "\n{/* changed */}\n");
  assert.equal(check(root).status, 1);
  assert.equal(check(root, "--update").status, 0);
  assert.equal(check(root).status, 0);
});

test("repository templates: visible copies match templates/ and contain no hardcoded GitHub URLs", () => {
  assert.equal(check(repo).status, 0);
  for (const f of ["templates/new-section.astro", "templates/new-feature-page.astro", "templates/new-resource-page.astro", "templates/new-footer-section.astro", "templates/new-post.md"]) {
    const s = readFileSync(join(repo, f), "utf8");
    assert.ok(!/github\.com/i.test(s), `${f} contains a hardcoded GitHub URL`);
    assert.ok(!/me\.webp/.test(s), `${f} references the missing profile image`);
  }
  assert.ok(!existsSync(join(repo, ".templates-restored")));
});
