import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  getGitHubEditUrl, getGitHubProfileUrl, getGitHubRepositoryUrl, getGitHubApiUrl, getRepositoryOwner, getRepositoryName,
  fetchProfile, fetchRepositories, fetchCommits, resetGitHubCache, filterRepositories, mapCommit, describeFailure,
} from "../src/lib/github.ts";
import { startMockGitHub, makeRepos } from "./helpers/mock-github.mjs";

let mock;
const KEYS = ["SITE_REPOSITORY", "SITE_OWNER", "SITE_REF", "GITHUB_API_URL", "GITHUB_SERVER_URL", "GITHUB_TOKEN",
  "SITE_EXCLUDE_REPOS", "SITE_INCLUDE_SITE_REPO", "GITHUB_REPOSITORY", "GITHUB_REPOSITORY_OWNER", "GITHUB_REF_NAME"];
const saved = {};

beforeEach(async () => {
  for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  mock = await startMockGitHub();
  Object.assign(process.env, {
    SITE_REPOSITORY: "testowner/site", SITE_OWNER: "testowner", SITE_REF: "main", GITHUB_API_URL: mock.url,
  });
  resetGitHubCache();
});
afterEach(async () => {
  await mock.close();
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

test("URL generator: edit links contain the correct owner, repository, and branch", () => {
  assert.equal(getRepositoryOwner(), "testowner");
  assert.equal(getRepositoryName(), "site");
  assert.equal(getGitHubProfileUrl(), "https://github.com/testowner");
  assert.equal(getGitHubRepositoryUrl(), "https://github.com/testowner/site");
  assert.equal(getGitHubEditUrl("src/pages/about.astro"), "https://github.com/testowner/site/edit/main/src/pages/about.astro");
  assert.equal(getGitHubEditUrl("/src/pages/x.astro"), "https://github.com/testowner/site/edit/main/src/pages/x.astro");
  assert.equal(getGitHubApiUrl("/users/x"), `${mock.url}/users/x`);
  process.env.SITE_REF = "feature/x";
  assert.match(getGitHubEditUrl("a.md"), /edit\/feature%2Fx\/a\.md$/);
});

test("profile: login, name, avatar, and type", async () => {
  const r = await fetchProfile();
  assert.ok(r.ok);
  assert.equal(r.data.login, "testowner");
  assert.equal(r.data.name, "Test Owner");
  assert.match(r.data.avatarUrl, /avatars\.githubusercontent\.com/);
  assert.equal(r.data.type, "User");
});

test("repositories: forks and the website repository are filtered out; results are sorted by update time", async () => {
  mock.state.repos = [...makeRepos(4, { forks: 1 }), { ...makeRepos(1)[0], name: "site", full_name: "testowner/site", html_url: "https://github.com/testowner/site", updated_at: "2030-01-01T00:00:00Z" }];
  const r = await fetchRepositories();
  assert.ok(r.ok);
  const names = r.data.map((x) => x.name);
  assert.ok(!names.includes("site"), "website repository is excluded");
  assert.ok(!names.includes("repo-000"), "fork is excluded");
  assert.deepEqual(names, ["repo-001", "repo-002", "repo-003"]);
});

test("repositories: private=true is explicitly excluded; include and exclude rules", () => {
  const raw = [...makeRepos(2), { ...makeRepos(1)[0], name: "site", full_name: "testowner/site", html_url: "https://github.com/testowner/site" }];
  const base = { siteRepo: "site", excludeRepos: [], includeSiteRepo: false };
  assert.equal(filterRepositories(raw, base).length, 2);
  assert.equal(filterRepositories(raw, { ...base, includeSiteRepo: true }).length, 3);
  assert.equal(filterRepositories(raw, { ...base, excludeRepos: ["REPO-000"] }).length, 1);
  assert.equal(filterRepositories([{ ...makeRepos(1)[0], private: true }], base).length, 0);
  assert.equal(filterRepositories([{ ...makeRepos(1)[0], private: undefined }], base).length, 0);
  assert.equal(filterRepositories([{ ...makeRepos(1)[0], fork: undefined }], base).length, 0);
});

test("pagination: more than 100 repositories are processed", async () => {
  mock.state.repos = makeRepos(1105);
  const r = await fetchRepositories();
  assert.ok(r.ok);
  assert.equal(r.data.length, 1105);
  assert.equal(mock.requests.filter((q) => q.path.endsWith("/repos")).length, 12);
});

test("users use /users/…/repos, organizations use /orgs/…/repos", async () => {
  await fetchRepositories();
  assert.ok(mock.requests.some((q) => q.path === "/users/testowner/repos"));
  assert.ok(!mock.requests.some((q) => q.path.startsWith("/orgs/")));
  resetGitHubCache();
  mock.requests.length = 0;
  mock.state.type = "Organization";
  const p = await fetchProfile();
  assert.equal(p.data.type, "Organization");
  await fetchRepositories();
  assert.ok(mock.requests.some((q) => q.path === "/orgs/testowner/repos"));
});

test("account type: a missing profile prevents guessing a repository endpoint", async () => {
  mock.state.profile = false;
  const r = await fetchRepositories();
  assert.ok(!r.ok);
  assert.equal(r.reason, "not-found");
  assert.ok(!mock.requests.some((q) => q.path.endsWith("/repos")));
});

test("account type: an invalid profile type is rejected", async () => {
  mock.state.type = "SomethingElse";
  const p = await fetchProfile();
  assert.ok(!p.ok);
  assert.equal(p.reason, "invalid");
  const r = await fetchRepositories();
  assert.ok(!r.ok);
  assert.ok(!mock.requests.some((q) => q.path.endsWith("/repos")));
});

test("account type: a 403 response is preserved as an error", async () => {
  mock.state.fail = { status: 403 };
  const r = await fetchRepositories();
  assert.ok(!r.ok);
  assert.equal(r.reason, "forbidden");
  assert.ok(!mock.requests.some((q) => q.path.endsWith("/repos")));
});

test("commits: linked and unlinked authors are distinguished", async () => {
  const r = await fetchCommits();
  assert.ok(r.ok);
  const [linked, unlinked] = r.data;
  assert.equal(linked.message, "Linked commit");
  assert.equal(linked.author?.login, "alice");
  assert.equal(linked.authorName, "Alice Git");
  assert.equal(linked.committerName, "Automation Bot");
  assert.equal(unlinked.author, null, "do not invent a profile association");
  assert.equal(unlinked.authorName, "Bob Unlinked");
  assert.equal(unlinked.committerName, null);
  assert.equal(unlinked.shortSha, "bbbbbbb");
  assert.equal(mapCommit({ sha: "x", commit: { message: "m", author: null }, author: null }).authorName, "Unknown");
  const noMessage = mapCommit({ sha: "x", commit: { author: { name: "Git Author", date: "not-a-date" }, committer: { name: "Committer" } }, author: null });
  assert.equal(noMessage.message, "");
  assert.equal(noMessage.authorName, "Git Author");
  assert.equal(noMessage.committerName, "Committer");
  assert.equal(noMessage.date, "", "invalid dates are not exposed as real commit dates");
  assert.ok(mock.requests.some((q) => q.path === "/repos/testowner/site/commits" && q.search.includes("sha=main")));
});

test("cache: each request runs only once per build", async () => {
  await Promise.all([fetchProfile(), fetchProfile(), fetchRepositories(), fetchRepositories(), fetchCommits(), fetchCommits()]);
  const count = (re) => mock.requests.filter((q) => re.test(q.path)).length;
  assert.equal(count(/^\/users\/testowner$/), 1);
  assert.equal(count(/\/repos$/), 1);
  assert.equal(count(/commits$/), 1);
});

test("public API requests do not send credentials even when GITHUB_TOKEN is set", async () => {
  process.env.GITHUB_TOKEN = "secret-token";
  await fetchProfile();
  assert.equal(mock.requests[0].auth, null);
});

test("errors: rate limit, 404, server, and network failures do not expose tokens or URLs", async () => {
  mock.state.fail = { status: 403, headers: { "x-ratelimit-remaining": "0" } };
  let r = await fetchCommits();
  assert.ok(!r.ok);
  assert.equal(r.reason, "rate-limit");
  assert.match(describeFailure(r), /rate limit/i);

  resetGitHubCache();
  mock.state.fail = { status: 403 };
  assert.equal((await fetchCommits()).reason, "forbidden");

  resetGitHubCache();
  mock.state.fail = { status: 404 };
  assert.equal((await fetchCommits()).reason, "not-found");

  resetGitHubCache();
  mock.state.fail = { status: 500 };
  mock.requests.length = 0;
  r = await fetchCommits();
  assert.equal(r.reason, "http");
  assert.equal(mock.requests.length, 3, "server errors are retried");

  resetGitHubCache();
  process.env.GITHUB_TOKEN = "secret-token";
  process.env.GITHUB_API_URL = "http://127.0.0.1:1";
  r = await fetchCommits();
  assert.equal(r.reason, "network");
  assert.ok(!JSON.stringify(r).includes("secret-token"));
  assert.ok(!JSON.stringify(r).includes("127.0.0.1"));
});

test("an empty commit list does not produce an error", async () => {
  mock.state.commits = [];
  const r = await fetchCommits();
  assert.ok(r.ok);
  assert.deepEqual(r.data, []);
});

test("profile: network errors are propagated; a user account is not guessed", async () => {
  process.env.GITHUB_API_URL = "http://127.0.0.1:1";
  const r = await fetchRepositories();
  assert.ok(!r.ok);
  assert.equal(r.reason, "network");
});

test("pagination: a missing Link header is handled with a next-page check", async () => {
  mock.state.repos = makeRepos(205);
  mock.state.linkMode = "missing";
  const r = await fetchRepositories();
  assert.ok(r.ok);
  assert.equal(r.data.length, 205);
  assert.equal(mock.requests.filter((q) => q.path.endsWith("/repos")).length, 3);
});

test("pagination: foreign next URLs and page cycles are rejected as incomplete data", async () => {
  mock.state.repos = makeRepos(150);
  mock.state.linkMode = "invalid";
  let r = await fetchRepositories();
  assert.ok(!r.ok);
  assert.equal(r.reason, "invalid");
  resetGitHubCache();
  mock.requests.length = 0;
  mock.state.linkMode = "cycle";
  r = await fetchRepositories();
  assert.ok(!r.ok);
  assert.equal(r.reason, "invalid");
});

test("pagination: an error on a later page does not return a seemingly complete list", async () => {
  mock.state.repos = makeRepos(205);
  mock.state.failPage = { page: 2, status: 503 };
  const r = await fetchRepositories();
  assert.ok(!r.ok);
  assert.equal(r.reason, "http");
  assert.ok(mock.requests.some((q) => q.search.includes("page=2")));
});

test("an empty repository list is a valid result", async () => {
  mock.state.repos = [];
  const r = await fetchRepositories();
  assert.ok(r.ok);
  assert.deepEqual(r.data, []);
});

test("avatar validation: valid GitHub avatar URLs are accepted", async () => {
  const { isGitHubAvatarUrl, safeAvatarUrl, avatarSrc } = await import("../src/lib/github.ts");
  // Standard avatar host
  assert.ok(isGitHubAvatarUrl("https://avatars.githubusercontent.com/u/1?v=4"));
  // Other valid GitHub image hosts
  assert.ok(isGitHubAvatarUrl("https://github.githubassets.com/images/icons/emoji/unicode/1f44d.png"));
  assert.ok(isGitHubAvatarUrl("https://raw.githubusercontent.com/user/repo/main/avatar.png"));
  assert.ok(isGitHubAvatarUrl("https://user-images.githubusercontent.com/12345/abcdef.png"));
  assert.ok(isGitHubAvatarUrl("https://repository-images.githubusercontent.com/123456/image.png"));
  // safeAvatarUrl returns URL when valid
  assert.equal(safeAvatarUrl("https://avatars.githubusercontent.com/u/1?v=4"), "https://avatars.githubusercontent.com/u/1?v=4");
  // avatarSrc adds size parameter
  assert.match(avatarSrc("https://avatars.githubusercontent.com/u/1?v=4"), /s=320/);
  assert.match(avatarSrc("https://avatars.githubusercontent.com/u/1?v=4", 64), /s=64/);
});

test("avatar validation: invalid and external URLs are rejected", async () => {
  const { isGitHubAvatarUrl, safeAvatarUrl, avatarSrc } = await import("../src/lib/github.ts");
  // HTTP rejected
  assert.ok(!isGitHubAvatarUrl("http://avatars.githubusercontent.com/u/1"));
  // External host rejected
  assert.ok(!isGitHubAvatarUrl("https://evil.example.com/avatar.png"));
  // Non-string rejected
  assert.ok(!isGitHubAvatarUrl(null));
  assert.ok(!isGitHubAvatarUrl(undefined));
  assert.ok(!isGitHubAvatarUrl(42));
  // Subdomain spoofing rejected
  assert.ok(!isGitHubAvatarUrl("https://avatars.githubusercontent.com.evil.com/u/1"));
  // safeAvatarUrl returns fallback for invalid
  assert.equal(safeAvatarUrl("https://evil.example.com/avatar.png"), "");
  assert.equal(safeAvatarUrl(null, "/fallback.png"), "/fallback.png");
  // avatarSrc returns empty for invalid
  assert.equal(avatarSrc("https://evil.example.com/avatar.png"), "");
  assert.equal(avatarSrc("not-a-url"), "");
});


test("avatar validation: valid GitHub avatar URLs are accepted", async () => {
  const { isGitHubAvatarUrl, safeAvatarUrl, avatarSrc } = await import("../src/lib/github.ts");
  // Standard avatar host
  assert.ok(isGitHubAvatarUrl("https://avatars.githubusercontent.com/u/1?v=4"));
  // Other valid GitHub image hosts
  assert.ok(isGitHubAvatarUrl("https://github.githubassets.com/images/icons/emoji/unicode/1f44d.png"));
  assert.ok(isGitHubAvatarUrl("https://raw.githubusercontent.com/user/repo/main/avatar.png"));
  assert.ok(isGitHubAvatarUrl("https://user-images.githubusercontent.com/12345/abcdef.png"));
  assert.ok(isGitHubAvatarUrl("https://repository-images.githubusercontent.com/123456/image.png"));
  // safeAvatarUrl returns URL when valid
  assert.equal(safeAvatarUrl("https://avatars.githubusercontent.com/u/1?v=4"), "https://avatars.githubusercontent.com/u/1?v=4");
  // avatarSrc adds size parameter
  assert.match(avatarSrc("https://avatars.githubusercontent.com/u/1?v=4"), /s=320/);
  assert.match(avatarSrc("https://avatars.githubusercontent.com/u/1?v=4", 64), /s=64/);
});

test("avatar validation: invalid and external URLs are rejected", async () => {
  const { isGitHubAvatarUrl, safeAvatarUrl, avatarSrc } = await import("../src/lib/github.ts");
  // HTTP rejected
  assert.ok(!isGitHubAvatarUrl("http://avatars.githubusercontent.com/u/1"));
  // External host rejected
  assert.ok(!isGitHubAvatarUrl("https://evil.example.com/avatar.png"));
  // Non-string rejected
  assert.ok(!isGitHubAvatarUrl(null));
  assert.ok(!isGitHubAvatarUrl(undefined));
  assert.ok(!isGitHubAvatarUrl(42));
  // Subdomain spoofing rejected
  assert.ok(!isGitHubAvatarUrl("https://avatars.githubusercontent.com.evil.com/u/1"));
  // safeAvatarUrl returns fallback for invalid
  assert.equal(safeAvatarUrl("https://evil.example.com/avatar.png"), "");
  assert.equal(safeAvatarUrl(null, "/fallback.png"), "/fallback.png");
  // avatarSrc returns empty for invalid
  assert.equal(avatarSrc("https://evil.example.com/avatar.png"), "");
  assert.equal(avatarSrc("not-a-url"), "");
});
