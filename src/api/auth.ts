import { Elysia } from "elysia"
import { eq, and, gt } from "drizzle-orm"
import { Octokit } from "octokit"
import { getDb } from "../db/index.js"
import { sessions } from "../db/schema.js"
import { loadConfig } from "../config.js"
import { encrypt, decrypt } from "../crypto.js"
import { logger } from "../logger.js"

const SESSION_DURATION_HOURS = 24

function generateState(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

export const authRoutes = new Elysia({ prefix: "/api/auth" })
  .get("/github", ({ set, cookie }) => {
    const config = loadConfig()
    const state = generateState()

    cookie.state?.set({
      value: state,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    })

    const params = new URLSearchParams({
      client_id: config.GITHUB_CLIENT_ID,
      redirect_uri: `${config.BASE_URL}/api/auth/callback`,
      scope: "read:user user:email",
      state,
    })

    set.redirect = `https://github.com/login/oauth/authorize?${params}`
  })
  .get("/callback", async ({ query, set, cookie }) => {
    const config = loadConfig()
    const code = query.code
    const state = query.state

    if (typeof code !== "string" || typeof state !== "string" || !code || !state) {
      cookie.state?.remove()
      set.redirect = "/?error=invalid_request"
      return
    }

    const savedState = cookie.state?.value
    if (!savedState || savedState !== state) {
      cookie.state?.remove()
      set.redirect = "/?error=invalid_state"
      return
    }

    cookie.state?.remove()

    try {
      const tokenResponse = await fetch(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            client_id: config.GITHUB_CLIENT_ID,
            client_secret: config.GITHUB_CLIENT_SECRET,
            code,
          }),
        }
      )

      const tokenData = (await tokenResponse.json()) as {
        access_token?: string
        error?: string
      }

      if (!tokenData.access_token) {
        logger.error("OAuth token exchange failed", { error: tokenData.error })
        set.redirect = "/?error=token_exchange_failed"
        return
      }

      const octokit = new Octokit({ auth: tokenData.access_token })
      const { data: user } = await octokit.rest.users.getAuthenticated()

      const db = getDb()
      const expiresAt = new Date(
        Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000
      )

      const encrypted = encrypt(tokenData.access_token, config.ENCRYPTION_KEY)

      const [session] = await db
        .insert(sessions)
        .values({
          githubUserId: user.id,
          githubUsername: user.login,
          githubAvatar: user.avatar_url,
          accessTokenEncrypted: encrypted.ciphertext,
          accessTokenIv: encrypted.iv,
          accessTokenAuthTag: encrypted.authTag,
          expiresAt,
        })
        .returning()

      const sessionId = session.id.toString()
      const signature = await signSessionId(sessionId, config.SESSION_SECRET)

      cookie.session?.set({
        value: `${sessionId}.${signature}`,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: SESSION_DURATION_HOURS * 60 * 60,
        path: "/",
      })

      set.redirect = "/"
    } catch (err) {
      logger.error("OAuth callback error", { error: String(err) })
      set.redirect = "/?error=auth_failed"
    }
  })
  .get("/me", async ({ cookie, set }) => {
    const session = await validateSession(cookie.session?.value as string | undefined)
    if (!session) {
      set.status = 401
      return { error: "Not authenticated" }
    }

    return {
      username: session.githubUsername,
      avatar: session.githubAvatar,
    }
  })
  .post("/logout", async ({ cookie }) => {
    if (cookie.session?.value) {
      const session = await validateSession(cookie.session.value as string)
      if (session) {
        const db = getDb()
        await db.delete(sessions).where(eq(sessions.id, session.id))
      }
    }

    cookie.session?.remove()
    return { status: "logged_out" }
  })

async function signSessionId(id: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(id))
  return Array.from(new Uint8Array(signature), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("")
}

async function verifySignature(
  id: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  )
  // Decode hex signature back to bytes for constant-time verification
  const sigBytes = new Uint8Array(
    signature.match(/.{2}/g)?.map((b) => parseInt(b, 16)) ?? []
  )
  if (sigBytes.length !== 32) return false
  return crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(id))
}

export async function validateSession(cookieValue: string | undefined): Promise<typeof sessions.$inferSelect | null> {
  if (!cookieValue) return null

  const [sessionId, signature] = cookieValue.split(".")
  if (!sessionId || !signature) return null

  const config = loadConfig()
  const valid = await verifySignature(sessionId, signature, config.SESSION_SECRET)
  if (!valid) return null

  const db = getDb()
  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(eq(sessions.id, parseInt(sessionId)), gt(sessions.expiresAt, new Date()))
    )
    .limit(1)

  return session ?? null
}
