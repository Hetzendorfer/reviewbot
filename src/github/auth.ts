import { createAppAuth } from "@octokit/auth-app";
import { loadConfig, getPrivateKey } from "../config.js";

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
  const auth = createAppAuthStrategy();
  const result = await auth({
    type: "installation",
    installationId,
  });
  return result.token;
}
