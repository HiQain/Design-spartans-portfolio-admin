import { API_ORIGIN } from "./api-config";
import { getToken } from "./auth-token";

/**
 * Not part of the generated client - multipart file upload doesn't fit
 * orval's Zod-schema codegen cleanly (see backend openapi.yaml comments),
 * so this is a small hand-written call instead.
 */
export async function uploadImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_ORIGIN}/api/uploads`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Image upload failed: ${response.status}`);
  }

  const data = (await response.json()) as { url: string };
  return data.url;
}
