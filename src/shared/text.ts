/**
 * Display text must not use dash punctuation. AI output is normalised here
 * before it is stored or streamed, and the browser uses the same helper for
 * older records that may already contain a dash.
 */
const DASHES = /[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]+/g;

export const withoutDashes = (value: string): string =>
  value.replace(DASHES, ' ').replace(/[ \t]{2,}/g, ' ');
