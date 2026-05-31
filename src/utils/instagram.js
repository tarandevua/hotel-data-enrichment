/**
 * Extract Instagram handle from any Instagram URL
 */
export function extractInstagramHandle(url) {
  if (!url) return null;

  try {
    const cleaned = url
      .split('?')[0]
      .replace(/\/$/, '');

    const match = cleaned.match(
      /instagram\.com\/([^\/]+)/i
    );

    return match ? match[1] : null;
  } catch {
    return null;
  }
}