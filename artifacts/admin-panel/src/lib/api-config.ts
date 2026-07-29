import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import { getToken } from "./auth-token";

/** Origin only (no /api suffix) - the generated client's URLs already embed "/api/...". */
export const API_ORIGIN = import.meta.env.VITE_API_BASE_URL as string;

if (!API_ORIGIN) {
  throw new Error("VITE_API_BASE_URL must be set");
}

setBaseUrl(API_ORIGIN);
setAuthTokenGetter(() => getToken());
