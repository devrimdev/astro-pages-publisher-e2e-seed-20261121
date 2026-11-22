// Single source for GitHub URLs and GitHub API requests.
// All pages, the layout, and templates use these functions exclusively.
import { getSiteEnv } from "./site-env.mjs";

export type FailureReason = "network" | "timeout" | "rate-limit" | "not-found" | "forbidden" | "http" | "invalid";
export type Failure = { ok: false; reason: FailureReason; status?: number; message: string };
export type Result<T> = { ok: true; data: T } | Failure;

export type Profile = {
  login: string;
  name: string;
  avatarUrl: string;
  url: string;
  type: "User" | "Organization";
};

export type Repo = {
  name: string;
  url: string;
  description: string | null;
  language: string | null;
  stars: number;
  updatedAt: string;
};

export type Commit = {
  sha: string;
  shortSha: string;
  url: string;
  message: string;
  date: string;
  /** Name from commit.author; do not confuse it with GitHub account.login. */
  authorName: string;
  /** Name from commit.committer; it may differ from the Git author. */
  committerName: string | null;
  /** GitHub account associated with the commit by GitHub. */
  author: { login: string; url: string; avatarUrl: string } | null;
};

// ---------- Configuration & URL generation ----------

export function getRepositoryConfig() {
  return getSiteEnv();
}
export const getRepositoryOwner = () => getSiteEnv().owner;
export const getRepositoryName = () => getSiteEnv().repo;

export function getGitHubProfileUrl(): string {
  const c = getSiteEnv();
  return `${c.serverUrl}/${c.owner}`;
}
export function getGitHubRepositoryUrl(): string {
  const c = getSiteEnv();
  return `${c.serverUrl}/${c.owner}/${c.repo}`;
}
/** Edit link for a file in the website repository, e.g. "src/pages/about.astro". */
export function getGitHubEditUrl(path: string): string {
  const c = getSiteEnv();
  const clean = path.replace(/^\/+/, "");
  return `${c.serverUrl}/${c.owner}/${c.repo}/edit/${encodeURIComponent(c.ref)}/${clean}`;
}
export function getGitHubApiUrl(path: string): string {
  return `${getSiteEnv().apiUrl}/${path.replace(/^\/+/, "")}`;
}

// ---------- HTTP with error classification ----------

const PER_PAGE = 100;
const ATTEMPTS = 3;
const TIMEOUT_MS = 10_000;
type RequestSuccess = { ok: true; body: unknown; next: string | null };

function invalid(message: string): Failure {
  return { ok: false, reason: "invalid", message };
}

/**
 * Reads rel=next from GitHub Link headers. A link must never inject a different
 * API host or endpoint; doing so would pose both a data-integrity and an
 * SSRF risk. An explicitly invalid next link ends the request.
 */
function parseNextLink(link: string | null, currentUrl: string): Result<string | null> {
  if (!link) return { ok: true, data: null };
  const entries = [...link.matchAll(/<([^<>]+)>\s*;\s*([^,]+)/g)];
  const next = entries.find(([, , params]) => /(?:^|;)\s*rel\s*=\s*(?:"next"|'next'|next)(?:\s|;|$)/i.test(params));
  if (!next) {
    if (/\brel\s*=\s*["']?next\b/i.test(link)) return invalid("GitHub returned an invalid pagination link.");
    return { ok: true, data: null };
  }

  try {
    const current = new URL(currentUrl);
    const candidate = new URL(next[1], current);
    if (candidate.origin !== current.origin || candidate.pathname !== current.pathname || candidate.username || candidate.password) {
      return invalid("GitHub returned an untrusted pagination link.");
    }
    return { ok: true, data: candidate.toString() };
  } catch {
    return invalid("GitHub returned an invalid pagination URL.");
  }
}

async function request(url: string): Promise<RequestSuccess | Failure> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "astro-github-pages-site",
  };

  let last: Failure = { ok: false, reason: "network", message: "GitHub is not reachable." };
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.ok) {
        let body: unknown;
        try {
          body = await res.json();
        } catch {
          return invalid("GitHub returned an invalid JSON response.");
        }
        const pagination = parseNextLink(res.headers.get("link"), url);
        if (!pagination.ok) return pagination;
        return { ok: true, body, next: pagination.data };
      }

      const limited = res.status === 429 || (res.status === 403 && (res.headers.get("x-ratelimit-remaining") === "0" || res.headers.has("retry-after")));
      if (limited) return { ok: false, reason: "rate-limit", status: res.status, message: "The GitHub API rate limit was reached." };
      if (res.status === 404) return { ok: false, reason: "not-found", status: 404, message: "GitHub could not find this account or repository." };
      if (res.status === 403) return { ok: false, reason: "forbidden", status: 403, message: "GitHub denied access." };

      last = { ok: false, reason: "http", status: res.status, message: `GitHub answered with HTTP ${res.status}.` };
      if (res.status < 500) return last;
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      last = name === "TimeoutError" || name === "AbortError"
        ? { ok: false, reason: "timeout", message: "The GitHub API request timed out." }
        : { ok: false, reason: "network", message: "GitHub is not reachable." };
    }
    if (attempt < ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
  }
  return last;
}

/** Adds a readable error message without exposing tokens or URLs. */
export function describeFailure(f: Failure): string {
  return `${f.message} Data will update with the next successful build.`;
}

// ---------- Cache: each request is made only once per build ----------

const cache = new Map<string, Promise<unknown>>();
export function resetGitHubCache(): void {
  cache.clear();
}
function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  const c = getSiteEnv();
  const k = `${c.apiUrl}|${c.fullName}|${key}`;
  if (!cache.has(k)) cache.set(k, load());
  return cache.get(k) as Promise<T>;
}

function isHttpsUrl(value: unknown, expectedOrigin?: string): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && (!expectedOrigin || url.origin === expectedOrigin);
  } catch {
    return false;
  }
}

/**
 * Valid GitHub image sources. GitHub serves avatars from several subdomains;
 * all must use HTTPS. Arbitrary external hosts are rejected.
 */
const GITHUB_IMAGE_HOSTS = new Set([
  "avatars.githubusercontent.com",
  "github.githubassets.com",
  "raw.githubusercontent.com",
  "user-images.githubusercontent.com",
  "repository-images.githubusercontent.com",
]);

/** Central validation for avatar/image URLs from GitHub. */
export function isGitHubAvatarUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && GITHUB_IMAGE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/** Returns the URL if it is a valid GitHub image, otherwise the fallback (empty string). */
export function safeAvatarUrl(value: unknown, fallback = ""): string {
  return isGitHubAvatarUrl(value) ? (value as string) : fallback;
}

// ---------- Profile / account type ----------

export function fetchProfile(): Promise<Result<Profile>> {
  return once("profile", async () => {
    const c = getSiteEnv();
    const r = await request(getGitHubApiUrl(`users/${encodeURIComponent(c.owner)}`));
    if (!r.ok) return warn(r, "profile");
    const b = r.body as Record<string, unknown>;
    const serverOrigin = new URL(c.serverUrl).origin;
    if (
      !b || typeof b.login !== "string" || b.login.toLowerCase() !== c.owner.toLowerCase() ||
      typeof b.avatar_url !== "string" || !isGitHubAvatarUrl(b.avatar_url) ||
      !isHttpsUrl(b.html_url, serverOrigin) || (b.type !== "User" && b.type !== "Organization")
    ) {
      return warn(invalid("Unexpected or mismatched GitHub profile response."), "profile");
    }
    const profile: Profile = {
      login: b.login,
      name: (typeof b.name === "string" && b.name.trim()) || b.login,
      avatarUrl: b.avatar_url,
      url: b.html_url,
      type: b.type,
    };
    return { ok: true, data: profile };
  });
}

/** Resizes the GitHub avatar to the specified pixel size. */
export function avatarSrc(url: string, size = 320): string {
  if (!isGitHubAvatarUrl(url)) return "";
  try {
    const u = new URL(url);
    u.searchParams.set("s", String(size));
    return u.toString();
  } catch {
    return "";
  }
}

// ---------- Repositories ----------

export function filterRepositories(
  raw: Array<Record<string, unknown>>,
  opts: { siteRepo: string; excludeRepos: string[]; includeSiteRepo: boolean; owner?: string; serverUrl?: string },
): Repo[] {
  const excluded = new Set(opts.excludeRepos.map((s) => s.toLowerCase()));
  if (!opts.includeSiteRepo) excluded.add(opts.siteRepo.toLowerCase());
  const expectedOrigin = opts.serverUrl ? new URL(opts.serverUrl).origin : "https://github.com";
  const owner = opts.owner?.toLowerCase();

  return raw
    .filter((r) => {
      if (!r || r.private !== false || r.fork !== false || typeof r.name !== "string" || !r.name || excluded.has(r.name.toLowerCase())) return false;
      if (owner && typeof r.full_name === "string" && r.full_name.toLowerCase() !== `${owner}/${r.name.toLowerCase()}`) return false;
      if (typeof r.html_url !== "string") return false;
      try {
        const url = new URL(r.html_url);
        return url.protocol === "https:" && url.origin === expectedOrigin &&
          (!owner || url.pathname.replace(/\/$/, "").toLowerCase() === `/${owner}/${r.name.toLowerCase()}`);
      } catch {
        return false;
      }
    })
    .map((r) => ({
      name: r.name as string,
      url: r.html_url as string,
      description: typeof r.description === "string" ? r.description : null,
      language: typeof r.language === "string" ? r.language : null,
      stars: Number.isFinite(Number(r.stargazers_count)) ? Math.max(0, Number(r.stargazers_count)) : 0,
      updatedAt: typeof r.updated_at === "string" ? r.updated_at : typeof r.pushed_at === "string" ? r.pushed_at : "",
    }))
    .sort((a, b) => {
      const aTime = Date.parse(a.updatedAt);
      const bTime = Date.parse(b.updatedAt);
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    });
}

function fallbackNextPage(current: string): string | null {
  try {
    const url = new URL(current);
    const page = Number(url.searchParams.get("page") || "1");
    if (!Number.isSafeInteger(page) || page < 1) return null;
    url.searchParams.set("page", String(page + 1));
    return url.toString();
  } catch {
    return null;
  }
}

export function fetchRepositories(): Promise<Result<Repo[]>> {
  return once("repos", async () => {
    const c = getSiteEnv();
    // The account type must be known with certainty. Never silently switch to /users/ after an API error.
    const profile = await fetchProfile();
    if (!profile.ok) return warn(profile, "repositories/account-type");
    const org = profile.data.type === "Organization";
    const query = org ? "type=public&sort=updated" : "type=owner&sort=updated";
    let url: string | null = getGitHubApiUrl(
      `${org ? "orgs" : "users"}/${encodeURIComponent(c.owner)}/repos?${query}&per_page=${PER_PAGE}`,
    );
    const visited = new Set<string>();
    const all: Array<Record<string, unknown>> = [];

    while (url) {
      if (visited.has(url)) return warn(invalid("GitHub pagination repeated a page; repository results are incomplete."), "repositories");
      visited.add(url);
      const r = await request(url);
      if (!r.ok) return warn(r, "repositories");
      if (!Array.isArray(r.body)) return warn(invalid("Unexpected repository response."), "repositories");

      const page = r.body as Array<Record<string, unknown>>;
      all.push(...page);
      // GitHub normally provides rel=next for full pages. If the header is missing,
      // the next page is checked conservatively; an empty next page ends the list.
      url = r.next ?? (page.length === PER_PAGE ? fallbackNextPage(url) : null);
      if (page.length === PER_PAGE && !r.next && !url) {
        return warn(invalid("GitHub omitted pagination information; repository results may be incomplete."), "repositories");
      }
    }

    return {
      ok: true,
      data: filterRepositories(all, {
        siteRepo: c.repo,
        excludeRepos: c.excludeRepos,
        includeSiteRepo: c.includeSiteRepo,
        owner: c.owner,
        serverUrl: c.serverUrl,
      }),
    };
  });
}

// ---------- Commits ----------

export function mapCommit(raw: Record<string, any>): Commit {
  const gitAuthor = raw?.commit?.author && typeof raw.commit.author === "object" ? raw.commit.author : null;
  const gitCommitter = raw?.commit?.committer && typeof raw.commit.committer === "object" ? raw.commit.committer : null;
  const linked = raw?.author && typeof raw.author.login === "string" &&
    typeof raw.author.html_url === "string" && typeof raw.author.avatar_url === "string" ? raw.author : null;
  const message = typeof raw?.commit?.message === "string" ? raw.commit.message.split("\n")[0].trim() : "";
  const rawDate = typeof gitAuthor?.date === "string" ? gitAuthor.date : typeof gitCommitter?.date === "string" ? gitCommitter.date : "";
  const date = rawDate && Number.isFinite(Date.parse(rawDate)) ? rawDate : "";
  return {
    sha: typeof raw?.sha === "string" ? raw.sha : "",
    shortSha: typeof raw?.sha === "string" ? raw.sha.slice(0, 7) : "",
    url: typeof raw?.html_url === "string" && isHttpsUrl(raw.html_url, new URL(getSiteEnv().serverUrl).origin) ? raw.html_url : "",
    message,
    date,
    authorName: typeof gitAuthor?.name === "string" && gitAuthor.name ? gitAuthor.name : "Unknown",
    committerName: typeof gitCommitter?.name === "string" && gitCommitter.name ? gitCommitter.name : null,
    author: linked && isHttpsUrl(linked.html_url, new URL(getSiteEnv().serverUrl).origin) && isGitHubAvatarUrl(linked.avatar_url)
      ? { login: linked.login, url: linked.html_url, avatarUrl: linked.avatar_url }
      : null,
  };
}

export function fetchCommits(limit = 30): Promise<Result<Commit[]>> {
  return once(`commits:${limit}`, async () => {
    const c = getSiteEnv();
    const path = `repos/${c.owner}/${c.repo}/commits?sha=${encodeURIComponent(c.ref)}&per_page=${limit}`;
    const r = await request(getGitHubApiUrl(path));
    if (!r.ok) return warn(r, "commits");
    if (!Array.isArray(r.body)) return warn(invalid("Unexpected commit response."), "commits");
    return { ok: true, data: (r.body as Array<Record<string, any>>).map(mapCommit) };
  });
}

function warn(f: Failure, what: string): Failure {
  console.warn(`[github] ${what}: ${f.reason}${f.status ? ` (HTTP ${f.status})` : ""} – page is built with an error notice.`);
  return f;
}
