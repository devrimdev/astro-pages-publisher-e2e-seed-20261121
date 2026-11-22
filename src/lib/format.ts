// Consistent date formatting (UTC keeps builds identical across time zones).
export function formatDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function pageTitle(brand: string, title?: string): string {
  return title ? `~ $ ${brand} — ${title}` : `~ $ ${brand}`;
}

/** "my-section" -> "My Section" (filename -> display label). */
export function labelFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
