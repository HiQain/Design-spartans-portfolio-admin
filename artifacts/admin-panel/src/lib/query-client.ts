import { QueryClient, QueryCache, MutationCache } from "@tanstack/react-query";
import { ApiError } from "@workspace/api-client-react";
import { clearToken, getToken } from "./auth-token";

/**
 * A 401 from any query/mutation means the token expired or was revoked.
 * Firebase's SDK handled this implicitly; the replacement is explicit here -
 * clear the stored token and reload so App re-mounts into the logged-out state.
 */
function handleAuthError(error: unknown) {
  if (error instanceof ApiError && error.status === 401 && getToken()) {
    clearToken();
    window.location.reload();
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleAuthError }),
  mutationCache: new MutationCache({ onError: handleAuthError }),
});
