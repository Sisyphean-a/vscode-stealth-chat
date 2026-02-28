export function normalizeServerUrl(value: string): string {
  const input = typeof value === "string" ? value.trim() : "";
  if (!input) {
    return "";
  }

  try {
    const parsed = new URL(input);
    const pathname = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin}${pathname}`;
  } catch {
    return input.replace(/[?#].*$/, "").replace(/\/+$/, "");
  }
}

export function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export function linkifyImages(text: string): string {
  const pattern = /(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|bmp))/gi;
  return text.replace(pattern, (url) => {
    return `<a href="#" class="image-link" data-image-url="${escapeHtml(url)}">[图片]</a>`;
  });
}

export function formatShortTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function formatLogTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

export function formatDateLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const dateStr = date.toLocaleDateString();
  if (dateStr === today.toLocaleDateString()) {
    return "今天";
  }
  if (dateStr === yesterday.toLocaleDateString()) {
    return "昨天";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  if (year === today.getFullYear()) {
    return `${month}-${day}`;
  }
  return `${year}-${month}-${day}`;
}
