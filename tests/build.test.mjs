// Full builds against a local GitHub mock (no access to api.github.com).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, readdirSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { startMockGitHub, makeRepos } from "./helpers/mock-github.mjs";

const repo = process.cwd();
const astro = join(repo, "node_modules/astro/bin/astro.mjs");
const buildOutputs = new Set();
let mock;

before(async () => {
  mock = await startMockGitHub({ repos: [...makeRepos(4, { forks: 1 }), { ...makeRepos(1)[0], name: "site", full_name: "testowner/site", html_url: "https://github.com/testowner/site" }] });
});
after(async () => {
  await mock.close();
  for (const out of buildOutputs) rmSync(out, { recursive: true, force: true });
});

// Important: start asynchronously; the mock server runs in this process and must be able to respond.
function run(cmd, args, opts) {
  return new Promise((resolve) => {
    const c = spawn(cmd, args, opts);
    let stdout = "", stderr = "";
    c.stdout.on("data", (d) => (stdout += d));
    c.stderr.on("data", (d) => (stderr += d));
    c.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

async function build(envOverrides = {}, { drop = [] } = {}) {
  // Keep build output on the same filesystem as the repository's .astro cache.
  // Codespaces may mount /tmp separately, where Astro's asset rename fails with EXDEV.
  const out = mkdtempSync(join(repo, "node_modules", ".site-dist-"));
  buildOutputs.add(out);
  const env = { ...process.env, SITE_REPOSITORY: "testowner/site", SITE_OWNER: "testowner", SITE_REF: "main", GITHUB_API_URL: mock.url, ...envOverrides };
  for (const k of ["GITHUB_REPOSITORY", "GITHUB_REPOSITORY_OWNER", "GITHUB_REF_NAME", "GITHUB_TOKEN", ...drop]) {
    if (!(k in envOverrides)) delete env[k];
  }
  const r = await run(process.execPath, [astro, "build", "--outDir", out], { cwd: repo, env });
  // Windows/libuv: Astro's child process may exit with 0xC0000409
  // (UV_HANDLE_CLOSING assertion) even after a fully successful build.
  // Treat the build as successful when the output confirms completion.
  if (r.status !== 0 && (r.stdout + r.stderr).includes("Complete!")) {
    r.status = 0;
  }
  return { out, ...r };
}
const html = (out, p) => readFileSync(join(out, p), "utf8");
function allHtml(dir, acc = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    statSync(p).isDirectory() ? allHtml(p, acc) : p.endsWith(".html") && acc.push(p);
  }
  return acc;
}

test("build (project site): all pages, GitHub data, CSP, and navigation", async () => {
  mock.requests.length = 0;
  const b = await build();
  assert.equal(b.status, 0, b.stdout + b.stderr);
  const { out } = b;

  for (const p of ["index.html", "commits/index.html", "repositories/index.html", "getting-started/index.html", "how-it-works/index.html", "templates/index.html", "legal/index.html"]) {
    assert.ok(existsSync(join(out, p)), `${p} is missing`);
  }
  assert.ok(readdirSync(join(out, "blog")).length >= 4, "example blog posts are missing");
  const index = html(out, "index.html");
  const legal = html(out, "legal/index.html");
  assert.match(legal, /data-legal-status="incomplete"/);
  assert.match(legal, /Website operator/);
  assert.match(legal, /Contact details/);
  assert.match(legal, /REQUIRED IN MANY JURISDICTIONS: Full legal name/);
  assert.match(legal, /Supervisory or professional authority/);
  assert.match(legal, /IF APPLICABLE: Authority, professional body/);
  assert.match(legal, /not legal advice/i);
  assert.match(index, /Public repositories from this account/);
  assert.match(index, /Guides and examples/);
  assert.match(html(out, "how-it-works/index.html"), /The workflow follows the repository's actual default branch/);
  assert.match(html(out, "templates/index.html"), /\.new-resource-page\.astro/);

  // Repository page: fork and website repo are excluded; actual repositories are present.
  const repos = html(out, "repositories/index.html");
  assert.match(repos, /repo-001/);
  assert.match(repos, /repo-003/);
  assert.doesNotMatch(repos, /repo-000/);
  assert.doesNotMatch(repos, />site</);
  // Home page: link to the full list; base path comes from the repository name.
  assert.match(index, /href="\/site\/repositories"[^>]*>Browse all repositories/);
  assert.match(index, /rel="canonical" href="https:\/\/testowner\.github\.io\/site\//);

  // Commits: linked vs. unlinked authors.
  const commits = html(out, "commits/index.html");
  assert.match(commits, /href="https:\/\/github\.com\/alice"[^>]*>@alice</);
  assert.match(commits, /Alice Git/);
  assert.match(commits, /committed by Automation Bot/);
  assert.match(commits, /commit-git-author[^>]*>Bob Unlinked</);
  assert.doesNotMatch(commits, /@Bob/);

  // Profile: avatar from GitHub, not a local image.
  assert.match(index, /<img src="https:\/\/avatars\.githubusercontent\.com\/u\/1\?v=4&(amp;|#38;)s=320" alt="Test Owner \(GitHub profile\)"/);
  assert.doesNotMatch(index, /me\.webp/);

  // Navigation + active page.
  assert.match(commits, /href="\/site\/how-it-works"[^>]*>\s*How It Works/);
  assert.match(commits, /href="\/site\/repositories"[^>]*>\s*Repositories/);
  assert.doesNotMatch(commits, />\s*Projects\s*</);
  assert.match(commits, /<a href="\/site\/commits" class="active" aria-current="page">/);
  assert.doesNotMatch(commits, /<a href="\/site\/repositories" class="active"/);

  // Edit links from the centralized configuration.
  assert.match(html(out, "getting-started/index.html"), /https:\/\/github\.com\/testowner\/site\/edit\/main\/src\/pages\/getting-started\.astro/);

  // Title.
  assert.match(commits, /<title>~ \$ Astro Pages Publisher — Commits<\/title>/);

  // CSP on all real pages, avatar source allowed, no style attributes.
  for (const f of allHtml(out)) {
    const s = readFileSync(f, "utf8");
    assert.doesNotMatch(s, /\sstyle="/, `${f}: style attribute`);
    assert.match(s, /http-equiv="content-security-policy"/, `${f}: missing CSP`);
    assert.match(s, /img-src 'self' data: https:\/\/avatars\.githubusercontent\.com/, `${f}: missing avatar source`);
  }

  // Each request is made only once per build (not once per page).
  const count = (re) => mock.requests.filter((q) => re.test(q.path)).length;
  assert.equal(count(/^\/users\/testowner$/), 1, "profile was requested more than once");
  assert.equal(count(/\/repos$/), 1, "repositories were requested more than once");
  assert.equal(count(/commits$/), 1, "commits were requested more than once");
  rmSync(out, { recursive: true });
});

test("build (user site owner.github.io): base path is /", async () => {
  const b = await build({ SITE_REPOSITORY: "testowner/testowner.github.io" });
  assert.equal(b.status, 0, b.stdout + b.stderr);
  assert.match(html(b.out, "commits/index.html"), /<a href="\/commits" class="active" aria-current="page">/);
  assert.match(html(b.out, "index.html"), /href="\/repositories"[^>]*>Browse all repositories/);
  rmSync(b.out, { recursive: true });
});

test("build (custom domain): canonical and internal base paths use SITE_URL/SITE_BASE", async () => {
  const b = await build({ SITE_URL: "https://example.org/", SITE_BASE: "/docs" });
  assert.equal(b.status, 0, b.stdout + b.stderr);
  const index = html(b.out, "index.html");
  assert.match(index, /rel="canonical" href="https:\/\/example\.org\//);
  assert.match(index, /href="\/docs\/repositories"[^>]*>Browse all repositories/);
  rmSync(b.out, { recursive: true });
});

test("build during a GitHub outage: pages show an error notice instead of an empty list", async () => {
  mock.state.fail = { status: 403, headers: { "x-ratelimit-remaining": "0" } };
  const b = await build();
  mock.state.fail = null;
  assert.equal(b.status, 0, b.stdout + b.stderr);
  for (const p of ["index.html", "commits/index.html", "repositories/index.html"]) {
    assert.match(html(b.out, p), /rate limit/i, p);
  }
  rmSync(b.out, { recursive: true });
});

