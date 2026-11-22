---
title: "Customize the content without changing the engine"
pubDate: 2026-11-13
description: "A practical map of the brand settings, pages, posts, and footer links in a new fork."
---

The publishing engine and the site's editorial content are deliberately separate. You can change the subject, voice, and structure of the website while keeping its GitHub integration, shared layout, security policy, and deployment workflow intact.

## Set the site's identity

Edit `src/content/site.json`:

```json
{
  "brand": "Your site name",
  "description": "A concise description for search and sharing previews.",
  "bio": "A short introduction shown beside the GitHub profile.",
  "footerText": "A short line for the site footer."
}
```

The `brand` value is used in the header and page titles. The description is used as the page description by default. The introduction and footer text are visible copy. None of these values changes the GitHub account detected from the repository.

## Choose what to do with the sample articles

The four Markdown posts in `src/content/blog/` explain forking, customization, page creation, and GitHub Pages publishing. They are intentional starter content, not temporary build fixtures. Keep them as documentation for a reusable starter, adapt them to your audience, or replace them when the fork serves a different purpose.

A post needs a title and publication date in its frontmatter:

```yaml
---
title: "A useful article title"
pubDate: 2026-11-20
description: "A short summary of the article."
---
```

Write the body in Markdown. Posts with valid frontmatter are listed on the overview page and receive a route under `/blog/`.

## Add or change pages

Regular Astro pages live in `src/pages/`. Rename a hidden starter before editing it; the filename becomes the route and navigation label. Run `npm run generate` to refresh generated navigation, then `npm run verify` to check the page and the production build.

## Add footer information

Create footer pages from `src/pages/footer/.new-footer-section.astro`. Rename the file to a meaningful slug such as `privacy-policy.astro`, then replace the sample heading and copy. The footer navigation is generated from the pages that exist.

The Templates guide lists each starter and the rename rules. Keep the canonical files in `templates/` and the hidden working copies unchanged until they are renamed.
