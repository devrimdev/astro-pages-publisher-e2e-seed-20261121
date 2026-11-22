import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
  // Files beginning with "_" or "." (e.g. .new-post.md) are ignored.
  loader: glob({ pattern: '**/[^_.]*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    pubDate: z.coerce.date(),
    description: z.string().optional(),
  }),
});

export const collections = { blog };
