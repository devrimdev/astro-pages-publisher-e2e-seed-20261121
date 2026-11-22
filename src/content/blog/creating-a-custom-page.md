---
title: "Create a custom page from a starter template"
pubDate: 2026-11-14
description: "A step-by-step walkthrough of the standard, feature, and resource page starters."
---

Astro Pages Publisher includes several page patterns so a new page does not have to start from a blank file. Choose the starter that matches the content, rename it, and then make the new page your own.

## Choose a page pattern

- **Standard page** — use `src/pages/.new-section.astro` for an about page, project notes, or a simple information page.
- **Feature page** — use `src/pages/.new-feature-page.astro` for a larger introduction with feature cards and supporting sections.
- **Resource page** — use `src/pages/.new-resource-page.astro` for a curated directory of projects, tools, services, or links.

The canonical starter files live in `templates/`. Their hidden copies under `src/pages/` are working copies; leave them unchanged until you rename one.

## Create a page

For example, create a feature page from the starter:

```bash
mv src/pages/.new-feature-page.astro src/pages/features.astro
```

Then:

1. Replace the example heading, description, cards, and links in `src/pages/features.astro`.
2. Run `npm run generate` to refresh the generated navigation files.
3. Run `npm run verify` to check templates, content, Astro diagnostics, tests, and the production build.
4. Review the generated navigation and the page at its final URL.

The navigation generator discovers the new `features.astro` file automatically. On the next deployment, the template-preparation job restores a clean `.new-feature-page.astro` working copy from `templates/`. That restoration is intentional: it keeps the starter ready for another page without overwriting your renamed page.

## Update a reusable starter intentionally

If you want to improve the starter for future pages rather than create a single page, edit its visible hidden copy and synchronize the canonical file with:

```bash
npm run check-templates -- --update
```

Review the updated template and run `npm run verify` afterward. See the Templates guide for the complete catalogue and Getting Started for the fork and deployment setup.
