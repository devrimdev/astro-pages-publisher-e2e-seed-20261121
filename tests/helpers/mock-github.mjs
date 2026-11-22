// Minimal GitHub API mock (127.0.0.1 only; no real network access).
import { createServer } from "node:http";

export function makeRepos(n, { forks = 0, prefix = "repo", privateAt = [] } = {}) {
  return Array.from({ length: n }, (_, i) => {
    const name = `${prefix}-${String(i).padStart(3, "0")}`;
    return {
      name,
      full_name: `testowner/${name}`,
      html_url: `https://github.com/testowner/${name}`,
      description: i % 2 ? `Description ${i}` : null,
      language: i % 3 ? "TypeScript" : null,
      stargazers_count: i % 5,
      fork: i < forks,
      private: privateAt.includes(i),
      // descending order: higher number = older
      updated_at: new Date(Date.UTC(2026, 0, 1) - i * 86_400_000).toISOString(),
    };
  });
}

export const defaultCommits = [
  {
    sha: "aaaaaaaa1111111111111111111111111111111a",
    html_url: "https://github.com/testowner/site/commit/aaaaaaa",
    commit: {
      message: "Linked commit\n\nbody",
      author: { name: "Alice Git", date: "2026-10-30T10:00:00Z" },
      committer: { name: "Automation Bot", date: "2026-10-30T10:01:00Z" },
    },
    author: { login: "alice", html_url: "https://github.com/alice", avatar_url: "https://avatars.githubusercontent.com/u/5?v=4" },
  },
  {
    sha: "bbbbbbbb2222222222222222222222222222222b",
    html_url: "https://github.com/testowner/site/commit/bbbbbbb",
    commit: { message: "Unlinked commit", author: { name: "Bob Unlinked", date: "2026-10-29T10:00:00Z" }, committer: null },
    author: null,
  },
];

export async function startMockGitHub(initial = {}) {
  const state = {
    type: "User",
    profile: true,
    profileBody: null,
    repos: makeRepos(3),
    commits: defaultCommits,
    fail: null, // { status, headers, match?: RegExp }
    failPage: null, // { page, status, headers }
    linkMode: "normal", // normal | missing | invalid | cycle
    ...initial,
  };
  const requests = [];

  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    requests.push({ path: url.pathname, search: url.search, auth: req.headers.authorization ?? null });
    const send = (status, body, headers = {}) => {
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(JSON.stringify(body));
    };
    if (state.fail && (!state.fail.match || state.fail.match.test(url.pathname))) {
      return send(state.fail.status, { message: "mock failure" }, state.fail.headers);
    }
    const pageNumber = Number(url.searchParams.get("page") ?? 1);
    if (state.failPage && pageNumber === state.failPage.page && url.pathname.endsWith("/repos")) {
      return send(state.failPage.status ?? 503, { message: "later page failed" }, state.failPage.headers ?? {});
    }
    let m;
    if ((m = /^\/users\/([^/]+)$/.exec(url.pathname))) {
      if (!state.profile) return send(404, { message: "Not Found" });
      return send(200, state.profileBody ?? {
        login: m[1],
        name: "Test Owner",
        avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
        html_url: `https://github.com/${m[1]}`,
        type: state.type,
      });
    }
    if ((m = /^\/(users|orgs)\/([^/]+)\/repos$/.exec(url.pathname))) {
      const per = Number(url.searchParams.get("per_page") ?? 30);
      const page = Number(url.searchParams.get("page") ?? 1);
      const slice = state.repos.slice((page - 1) * per, page * per);
      const headers = {};
      if (state.linkMode === "normal" && page * per < state.repos.length) {
        const next = new URL(url);
        next.searchParams.set("page", String(page + 1));
        headers.link = `<http://${req.headers.host}${next.pathname}${next.search}>; rel="next"`;
      } else if (state.linkMode === "invalid" && page === 1 && page * per < state.repos.length) {
        headers.link = `<https://attacker.invalid${url.pathname}?page=2>; rel="next"`;
      } else if (state.linkMode === "cycle" && page === 1 && page * per < state.repos.length) {
        headers.link = `<http://${req.headers.host}${url.pathname}${url.search}>; rel="next"`;
      }
      return send(200, slice, headers);
    }
    if (/^\/repos\/[^/]+\/[^/]+\/commits$/.test(url.pathname)) return send(200, state.commits);
    return send(404, { message: "Not Found" });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    state,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
