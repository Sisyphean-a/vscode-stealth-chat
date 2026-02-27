import { normalizeServerUrl } from "./format";

export type PendingAttachment = {
  data: string;
  filename: string;
  size: number;
};

function buildUploadUrl(serverUrl: string): string {
  const normalized = normalizeServerUrl(serverUrl);
  if (!normalized) {
    throw new Error("Missing server URL");
  }
  return `${normalized}/api/upload`;
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (!result || typeof result !== "string") {
        reject(new Error("Failed to parse file data"));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export async function uploadAll(
  serverUrl: string,
  authToken: string,
  pending: PendingAttachment[]
): Promise<Array<{ type: string; url?: string; data?: string; filename?: string; size?: number }>> {
  const uploads: Array<{ type: string; url?: string; data?: string; filename?: string; size?: number }> = [];
  for (const attachment of pending) {
    const response = await fetch(buildUploadUrl(serverUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        data: attachment.data,
        filename: attachment.filename,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "Upload failed" }));
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (!payload.success) {
      throw new Error(payload.error || "Upload failed");
    }
    uploads.push(payload.attachment);
  }
  return uploads;
}
