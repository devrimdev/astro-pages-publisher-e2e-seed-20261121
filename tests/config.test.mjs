import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { getSiteEnv, parseGitRemote, inferLocalGitContext } from "../src/lib/site-env.mjs";

const ok = { SITE_REPOSITORY: "Octo/site", SITE_OWNER: "Octo", SITE_REF: "main" };

test("missing repository context is rejected when neither env nor Git metadata is supplied", () => {
  assert.throws(() => getSiteEnv({ SITE_OWNER: "x", SITE_REF: "main" }), /SITE_REPOSITORY is not set/);
  assert.throws(() => getSiteEnv({}), /Configuration error/);
});

test("local Git metadata supplies repository and branch automatically", () => {
  const c = getSiteEnv({}, { gitContext: {
    fullName: "example-owner/example-repository",
    ref: "main",
    serverUrl: "https://github.com",
  }});
  assert.equal(c.fullName, "example-owner/example-repository");
  assert.equal(c.owner, "example-owner");
  assert.equal(c.repo, "example-repository");
  assert.equal(c.ref, "main");
});

test("explicit environment values override local Git metadata", () => {
  const c = getSiteEnv({ SITE_REPOSITORY: "fork-owner/forked-site", SITE_REF: "preview" }, { gitContext: {
    fullName: "original-owner/original-site", ref: "main", serverUrl: "https://github.com",
  }});
  assert.equal(c.fullName, "fork-owner/forked-site");
  assert.equal(c.ref, "preview");
});

test("local checkout automatically reads origin and the current branch", () => {
  const cwd = mkdtempSync(join(tmpdir(), "example-repositorys-git-context-"));
  try {
    execFileSync("git", ["init", "-b", "main"], { cwd, stdio: "ignore" });
    execFileSync("git", ["remote", "add", "origin", "https://github.com/example-owner/example-repository.git"], { cwd, stdio: "ignore" });
    const context = inferLocalGitContext(cwd);
    assert.equal(context.fullName, "example-owner/example-repository");
    assert.equal(context.owner, "example-owner");
    assert.equal(context.repo, "example-repository");
    assert.equal(context.ref, "main");
    assert.equal(context.serverUrl, "https://github.com");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("common GitHub remote formats are parsed", () => {
  assert.deepEqual(parseGitRemote("https://github.com/example-owner/example-repository.git"), {
    owner: "example-owner", repo: "example-repository", fullName: "example-owner/example-repository", host: "github.com",
  });
  assert.deepEqual(parseGitRemote("git@github.com:example-owner/example-repository.git"), {
    owner: "example-owner", repo: "example-repository", fullName: "example-owner/example-repository", host: "github.com",
  });
  assert.deepEqual(parseGitRemote("ssh://git@github.example.net/team/site.git"), {
    owner: "team", repo: "site", fullName: "team/site", host: "github.example.net",
  });
  assert.equal(parseGitRemote("not-a-remote"), null);
});

test("missing branch and invalid values are detected", () => {
  assert.throws(() => getSiteEnv({ SITE_REPOSITORY: "a/b" }), /branch/i);
  assert.throws(() => getSiteEnv({ ...ok, SITE_REPOSITORY: "single-part" }), /owner\/repository/);
  assert.throws(() => getSiteEnv({ ...ok, SITE_OWNER: "someone-else" }), /does not match/);
  assert.throws(() => getSiteEnv({ ...ok, SITE_REPOSITORY: "Octo/../x" }), /format|Invalid/);
});

test("GitHub default variables are accepted as the source", () => {
  const c = getSiteEnv({ GITHUB_REPOSITORY: "Octo/site", GITHUB_REPOSITORY_OWNER: "Octo", GITHUB_REF_NAME: "dev" });
  assert.equal(c.fullName, "Octo/site");
  assert.equal(c.ref, "dev");
});

test("project site: site and base are derived from owner/repository", () => {
  const c = getSiteEnv(ok);
  assert.equal(c.site, "https://octo.github.io");
  assert.equal(c.base, "/site");
  assert.equal(c.isUserSite, false);
});

test("user/organization site: base is /", () => {
  const c = getSiteEnv({ SITE_REPOSITORY: "Octo/octo.github.io", SITE_OWNER: "Octo", SITE_REF: "main" });
  assert.equal(c.base, "/");
  assert.equal(c.isUserSite, true);
});

test("custom domain via SITE_URL / SITE_BASE", () => {
  const c = getSiteEnv({ ...ok, SITE_URL: "https://example.org/", SITE_BASE: "docs/" });
  assert.equal(c.site, "https://example.org");
  assert.equal(c.base, "/docs");
  assert.equal(getSiteEnv({ ...ok, SITE_BASE: "/" }).base, "/");
});

test("repository filter options", () => {
  const c = getSiteEnv({ ...ok, SITE_EXCLUDE_REPOS: " A , b,,", SITE_INCLUDE_SITE_REPO: "true" });
  assert.deepEqual(c.excludeRepos, ["a", "b"]);
  assert.equal(c.includeSiteRepo, true);
});


test("owner validation accepts allowed hyphenated names", () => {
  const c = getSiteEnv({ SITE_REPOSITORY: "octo-bot/site_2", SITE_OWNER: "octo-bot", SITE_REF: "feature/new-page" });
  assert.equal(c.owner, "octo-bot");
  assert.equal(c.repo, "site_2");
  assert.equal(c.ref, "feature/new-page");
});

test("unsafe custom URLs and base paths are rejected", () => {
  assert.throws(() => getSiteEnv({ ...ok, SITE_URL: "http://example.org" }), /HTTPS origin/);
  assert.throws(() => getSiteEnv({ ...ok, SITE_URL: "https://example.org/path" }), /without a path/);
  assert.throws(() => getSiteEnv({ ...ok, SITE_BASE: "//evil.example" }), /SITE_BASE/);
  assert.throws(() => getSiteEnv({ ...ok, SITE_BASE: "/../escape" }), /SITE_BASE/);
  assert.throws(() => getSiteEnv({ ...ok, SITE_BASE: "/%2e%2e/escape" }), /SITE_BASE/);
});

test("GitHub Enterprise API paths are allowed; the server URL remains an origin", () => {
  const c = getSiteEnv({ ...ok, GITHUB_SERVER_URL: "https://github.example.net/", GITHUB_API_URL: "https://github.example.net/api/v3" });
  assert.equal(c.serverUrl, "https://github.example.net");
  assert.equal(c.apiUrl, "https://github.example.net/api/v3");
  assert.throws(() => getSiteEnv({ ...ok, GITHUB_SERVER_URL: "https://github.example.net/path" }), /must not contain a path/);
});


test("owner and repository lengths and syntax are validated", () => {
  assert.throws(() => getSiteEnv({ ...ok, SITE_OWNER: "bad/name" }), /Invalid owner/);
  assert.throws(() => getSiteEnv({ ...ok, SITE_OWNER: "bad--name" }), /Invalid owner/);
  assert.throws(() => getSiteEnv({ ...ok, SITE_OWNER: "a".repeat(40), SITE_REPOSITORY: `${"a".repeat(40)}/site` }), /Invalid owner/);
  assert.throws(() => getSiteEnv({ ...ok, SITE_REPOSITORY: `Octo/${"r".repeat(101)}` }), /Invalid repository name/);
});
