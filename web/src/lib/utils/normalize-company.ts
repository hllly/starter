const COMMON_SUFFIXES = [
  "inc",
  "llc",
  "ltd",
  "corp",
  "co",
  "corporation",
  "incorporated",
  "limited",
  "company",
  "gmbh",
  "ag",
  "sa",
  "srl",
  "bv",
  "nv",
  "pty",
  "pte",
  "plc",
];

const SUFFIX_PATTERN = new RegExp(
  `\\b(${COMMON_SUFFIXES.join("|")})\\.?\\s*$`,
  "i"
);

export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[.,\-_'"()&]/g, " ")
    .replace(SUFFIX_PATTERN, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeWebsite(url: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}
