// Centralized, validated configuration. GitHub Actions provides its context;
// local checkouts infer the same values from origin and the current Git branch.
// No owner, repository, or branch is hardcoded.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

let envFileLoaded = false;

/** Loads a local .env file if present. Existing environment variables take precedence. */
export function loadLocalEnv(cwd = process.cwd()) {
  if (envFileLoaded) return;
  envFileLoaded = true;
  const file = join(cwd, ".env");
  if (existsSync(file) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(file);
  }
}

const NAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/; // GitHub owner
const REPO = /^[A-Za-z0-9._-]+$/;

function fail(problem) {
  throw new Error(
    [
      "",
      "Configuration error: " + problem,
      "",
      "GitHub Actions supplies repository and branch information automatically.",
      "For local development, this project reads the origin remote and current Git branch.",
      "If automatic detection is unavailable (for example, outside a Git checkout), set SITE_REPOSITORY, SITE_OWNER, and SITE_REF as overrides.",
      "",
    ].join("\n"),
  );
}

/** Run a read-only Git command and return its trimmed output, or an empty string. */
function gitValue(args, cwd) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

/** Parse common HTTPS, SSH, and SCP-style Git remote URLs. */
export function parseGitRemote(remote) {
  if (!remote || typeof remote !== "string") return null;
  let host = "";
  let pathname = "";

  // SCP-style syntax: git@github.com:owner/repository.git
  const scp = remote.match(/^(?:[^@\s]+@)?([^:/\s]+):(.+)$/);
  if (scp && !remote.includes("://")) {
    host = scp[1];
    pathname = scp[2];
  } else {
    try {
      const url = new URL(remote);
      if (!["https:", "http:", "ssh:", "git:"].includes(url.protocol)) return null;
      host = url.hostname;
      pathname = url.pathname;
    } catch {
      return null;
    }
  }

  const parts = pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const repo = parts.at(-1).replace(/\.git$/i, "");
  const owner = parts.at(-2);
  if (!owner || !repo) return null;
  return { owner, repo, fullName: `${owner}/${repo}`, host };
}

/** Infer the repository and active branch from the local checkout without network access. */
export function inferLocalGitContext(cwd = process.cwd()) {
  const remote = gitValue(["remote", "get-url", "origin"], cwd);
  const repository = parseGitRemote(remote);
  const ref = gitValue(["branch", "--show-current"], cwd);
  return {
    ...(repository || {}),
    ref,
    serverUrl: repository?.host && repository.host.toLowerCase() !== "github.com"
      ? `https://${repository.host}`
      : "https://github.com",
  };
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @param {{ cwd?: string, gitContext?: ReturnType<typeof inferLocalGitContext> }} [options]
 */
export function getSiteEnv(env = process.env, options = {}) {
  if (env === process.env) loadLocalEnv(options.cwd);
  // GitHub Actions variables take precedence; local Git metadata is the automatic fallback.
  const gitContext = options.gitContext || (env === process.env ? inferLocalGitContext(options.cwd) : {});

  const full = (env.SITE_REPOSITORY || env.GITHUB_REPOSITORY || gitContext.fullName || "").trim();
  if (!full) fail("SITE_REPOSITORY is not set.");
  const parts = full.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    fail(`SITE_REPOSITORY must use the format "owner/repository" (received: "${full}").`);
  }
  const [ownerFromRepo, repo] = parts;
  const owner = (env.SITE_OWNER || env.GITHUB_REPOSITORY_OWNER || ownerFromRepo).trim();
  if (!NAME.test(owner) || owner.length > 39 || owner.includes("--")) fail(`Invalid owner: "${owner}".`);
  if (!REPO.test(repo) || repo === "." || repo === ".." || repo.length > 100) fail(`Invalid repository name: "${repo}".`);
  if (owner.toLowerCase() !== ownerFromRepo.toLowerCase()) {
    fail(`SITE_OWNER ("${owner}") does not match SITE_REPOSITORY ("${full}").`);
  }
  const ref = (env.SITE_REF || env.GITHUB_REF_NAME || gitContext.ref || "").trim();
  if (!ref) fail("The current branch could not be detected (SITE_REF is not set).");

  const normalizeOrigin = (value, label, { allowApiPath = false } = {}) => {
    let url;
    try {
      url = new URL(value);
    } catch {
      fail(`${label} is not a valid URL.`);
    }
    if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && url.protocol !== "http:")) {
      fail(`${label} must be a valid HTTP(S) URL without credentials, a query, or a fragment.`);
    }
    if (!allowApiPath && url.pathname !== "/") fail(`${label} must not contain a path.`);
    if (url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
      fail(`${label} must use HTTPS (HTTP is only allowed for local tests).`);
    }
    return url.toString().replace(/\/+$/, "");
  };

  const inferredServer = gitContext.serverUrl || "https://github.com";
  const serverUrl = normalizeOrigin(env.GITHUB_SERVER_URL || inferredServer, "GITHUB_SERVER_URL");
  const defaultApiUrl = serverUrl === "https://github.com" ? "https://api.github.com" : `${serverUrl}/api/v3`;
  const apiUrl = normalizeOrigin(env.GITHUB_API_URL || defaultApiUrl, "GITHUB_API_URL", { allowApiPath: true });

  // GitHub Pages: "<owner>.github.io" is a user/organization site (root),
  // while any other repository is a project site under /<repository>.
  const isUserSite = repo.toLowerCase() === `${owner.toLowerCase()}.github.io`;
  let site = `https://${owner.toLowerCase()}.github.io`;
  let base = isUserSite ? "/" : `/${repo}`;
  if (env.SITE_URL?.trim()) {
    let customSite;
    try { customSite = new URL(env.SITE_URL.trim()); } catch { fail("SITE_URL is not a valid URL."); }
    if (customSite.protocol !== "https:" || customSite.username || customSite.password || customSite.pathname !== "/" || customSite.search || customSite.hash) {
      fail("SITE_URL must be an HTTPS origin without a path, query, or fragment.");
    }
    site = customSite.origin;
  }
  if (env.SITE_BASE?.trim()) base = env.SITE_BASE.trim(); // e.g. "/" for a custom domain
  if (!base.startsWith("/")) base = `/${base}`;
  if (base.startsWith("//") || /[?#\\]/.test(base) || base.split("/").some((part) => part === "." || part === "..")) {
    fail("SITE_BASE must be a safe absolute path without a query, fragment, or traversal segments.");
  }
  let decodedBase;
  try { decodedBase = decodeURIComponent(base); } catch { fail("SITE_BASE contains invalid URL encoding."); }
  if (decodedBase.includes("\\") || /[?#]/.test(decodedBase) || decodedBase.split("/").some((part) => part === "." || part === "..")) {
    fail("SITE_BASE contains an unsafe encoded path segment.");
  }
  if (base.length > 1) base = base.replace(/\/+$/, "");

  const list = (v) =>
    (v || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

  return {
    owner,
    repo,
    fullName: `${owner}/${repo}`,
    ref,
    serverUrl,
    apiUrl,
    site,
    base,
    isUserSite,
    excludeRepos: list(env.SITE_EXCLUDE_REPOS),
    includeSiteRepo: /^(1|true|yes)$/i.test(env.SITE_INCLUDE_SITE_REPO || ""),
  };
}
