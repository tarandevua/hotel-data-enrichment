/**
 * regex.js — Shared regex patterns for data extraction.
 */

/** Matches most standard email addresses (case-insensitive) */
export const EMAIL_REGEX = /[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/gi;

/** Matches mailto: hrefs for anchor-based email extraction */
export const MAILTO_REGEX = /mailto:([A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,})/gi;

/** Matches Instagram profile URLs */
export const INSTAGRAM_REGEX = /https?:\/\/(www\.)?instagram\.com\/[A-Z0-9._%-]+\/?/gi;

/** Known spam/noise email prefixes to filter out */
export const EMAIL_BLOCKLIST = [
  'noreply',
  'no-reply',
  'donotreply',
  'mailer-daemon',
  'postmaster',
  'webmaster',
  'sentry',
  'privacy@',
  'support@sentry',
];

/**
 * Extract all unique valid emails from a text string.
 * @param {string} text
 * @returns {string[]}
 */
export function extractEmails(text) {
  const raw = [...(text.matchAll(EMAIL_REGEX) ?? [])].map((m) => m[0].toLowerCase());
  const fromMailto = [...(text.matchAll(MAILTO_REGEX) ?? [])].map((m) => m[1].toLowerCase());
  const all = [...new Set([...raw, ...fromMailto])];
  return all.filter(
    (email) => !EMAIL_BLOCKLIST.some((blocked) => email.startsWith(blocked)),
  );
}

/**
 * Extract the first Instagram URL from a text string.
 * @param {string} text
 * @returns {string | null}
 */
export function extractInstagram(text) {
  const match = text.match(INSTAGRAM_REGEX);
  return match ? match[0].replace(/\/$/, '') : null;
}
