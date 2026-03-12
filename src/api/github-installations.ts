import { eq } from "drizzle-orm"
import { Octokit } from "octokit"
import { getDb } from "../db/index.js"
import { installations, sessions } from "../db/schema.js"
import { loadConfig } from "../config.js"
import { decrypt } from "../crypto.js"

export function getAccessToken(session: typeof sessions.$inferSelect): string {
  const config = loadConfig()
  return decrypt({
    ciphertext: session.accessTokenEncrypted,
    iv: session.accessTokenIv,
    authTag: session.accessTokenAuthTag,
  }, config.ENCRYPTION_KEY)
}

export async function userHasInstallationAccess(
  session: typeof sessions.$inferSelect,
  installationId: number
): Promise<boolean> {
  try {
    const octokit = new Octokit({ auth: getAccessToken(session) })
    await octokit.request("GET /user/installations/{installation_id}/repositories", {
      installation_id: installationId,
      per_page: 1,
    })
    return true
  } catch {
    return false
  }
}

export async function getInstallationByGithubId(
  githubInstallationId: number
): Promise<typeof installations.$inferSelect | null> {
  const db = getDb()
  const [installation] = await db
    .select()
    .from(installations)
    .where(eq(installations.githubInstallationId, githubInstallationId))
    .limit(1)

  return installation ?? null
}
