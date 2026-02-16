import { createAppAuth } from "@octokit/auth-app";
import { loadConfig, getPrivateKey } from "../config.js";

interface CachedToken {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<number, CachedToken>();
const TOKEN_BUFFER_MS = 60_000; // refresh 1 minute before expiry

export function createAppAuthStrategy() {
  const config = loadConfig();
  return createAppAuth({
    appId: config.GITHUB_APP_ID,
    privateKey: getPrivateKey(config),
  });
}

export async function getInstallationToken(
  installationId: number
): Promise<string> {
  const cached = tokenCache.get(installationId);
  if (cached && cached.expiresAt > Date.now() + TOKEN_BUFFER_MS) {
    return cached.token;
  }

  const auth = createAppAuthStrategy();
  const result = await auth({
    type: "installation",
    installationId,
  });

  tokenCache.set(installationId, {
    token: result.token,
    expiresAt: new Date(result.expiresAt).getTime(),
  });

  return result.token;
}
