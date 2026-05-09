const IMAGE_TAG_FILENAME_FALLBACK = "image.png";
const LOG_IMAGE_LABEL_PREFIX = "[IMG:";
const LOG_IMAGE_LABEL_SUFFIX = "]";
const TRUNCATION_SUFFIX = "...";

export const LOG_IMAGE_FILENAME_MAX_LENGTH = 30;

function normalizeImageFilename(filename?: string): string {
  const trimmed = typeof filename === "string" ? filename.trim() : "";
  return trimmed.length > 0 ? trimmed : IMAGE_TAG_FILENAME_FALLBACK;
}

function truncateFilename(filename: string): string {
  if (filename.length <= LOG_IMAGE_FILENAME_MAX_LENGTH) {
    return filename;
  }
  const visibleLength = LOG_IMAGE_FILENAME_MAX_LENGTH - TRUNCATION_SUFFIX.length;
  if (visibleLength <= 0) {
    return TRUNCATION_SUFFIX.slice(0, LOG_IMAGE_FILENAME_MAX_LENGTH);
  }
  return `${filename.slice(0, visibleLength)}${TRUNCATION_SUFFIX}`;
}

export function formatLogImageLabel(filename?: string): string {
  const normalized = normalizeImageFilename(filename);
  return `${LOG_IMAGE_LABEL_PREFIX}${truncateFilename(normalized)}${LOG_IMAGE_LABEL_SUFFIX}`;
}

export function buildLogImageTagTitle(filename?: string): string {
  return normalizeImageFilename(filename);
}
