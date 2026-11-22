import { defineConfig } from 'astro/config';
import { getSiteEnv } from './src/lib/site-env.mjs';

// The domain and base path are derived from GitHub Actions context or, locally,
// from the origin remote and active Git branch. No local .env is needed for a
// standard checkout. For a custom domain, optionally set SITE_URL and SITE_BASE.
const { site, base } = getSiteEnv();

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
  // Astro 7 uses 'jsx' by default and removes whitespace between
  // inline elements (e.g. before the ✎ links). 'true' preserves the previous
  // HTML output, keeping the layout unchanged.
  compressHTML: true,
  markdown: {
    // Prism emits CSS classes instead of style="…" attributes (Shiki would
    // generate inline styles that are blocked by the CSP). Token colors
    // are defined in src/styles/global.css.
    syntaxHighlight: 'prism',
  },
  security: {
    // Astro hashes all inline scripts/styles during the build and writes the
    // policy as a <meta http-equiv="content-security-policy"> tag on every page.
    csp: {
      directives: [
        "default-src 'self'",
        // GitHub avatars are served directly by GitHub.
        "img-src 'self' data: https://avatars.githubusercontent.com https://github.githubassets.com https://raw.githubusercontent.com https://user-images.githubusercontent.com https://repository-images.githubusercontent.com",
        "font-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
      ],
    },
  },
});
