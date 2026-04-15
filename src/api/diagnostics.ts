import { desc, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { loadConfig } from "../config.js";
import { getDb } from "../db/index.js";
import { installationSettings, reviewJobs, reviews } from "../db/schema.js";
import { listWebhookTraces } from "../observability/webhook-traces.js";
import { getQueueStats } from "../review/pipeline.js";
import { validateSession } from "./auth.js";
import {
    getInstallationByGithubId,
    userHasInstallationAccess,
} from "./github-installations.js";

export const diagnosticsRoutes = new Elysia({
    prefix: "/api/installations",
}).get("/:installationId/diagnostics", async ({ params, cookie, set }) => {
    const session = await validateSession(
        cookie.session?.value as string | undefined,
    );
    if (!session) {
        set.status = 401;
        return { error: "Not authenticated" };
    }

    const githubInstallationId = Number.parseInt(params.installationId, 10);
    if (!Number.isFinite(githubInstallationId)) {
        set.status = 400;
        return { error: "Invalid installation ID" };
    }

    if (!(await userHasInstallationAccess(session, githubInstallationId))) {
        set.status = 403;
        return { error: "Access denied" };
    }

    const db = getDb();
    const config = loadConfig();
    const installation = await getInstallationByGithubId(githubInstallationId);
    const [settings] = installation
        ? await db
              .select({
                  enabled: installationSettings.enabled,
                  hasApiKey: installationSettings.apiKeyEncrypted,
                  provider: installationSettings.llmProvider,
                  model: installationSettings.llmModel,
              })
              .from(installationSettings)
              .where(eq(installationSettings.installationId, installation.id))
              .limit(1)
        : [];

    const recentJobs = await db
        .select({
            id: reviewJobs.id,
            repoFullName: reviewJobs.repoFullName,
            prNumber: reviewJobs.prNumber,
            status: reviewJobs.status,
            errorMessage: reviewJobs.errorMessage,
            createdAt: reviewJobs.createdAt,
            startedAt: reviewJobs.startedAt,
            completedAt: reviewJobs.completedAt,
        })
        .from(reviewJobs)
        .where(eq(reviewJobs.installationId, githubInstallationId))
        .orderBy(desc(reviewJobs.createdAt))
        .limit(10);

    const recentReviews = installation
        ? await db
              .select({
                  id: reviews.id,
                  repoFullName: reviews.repoFullName,
                  prNumber: reviews.prNumber,
                  status: reviews.status,
                  errorMessage: reviews.errorMessage,
                  inlineCommentCount: reviews.inlineCommentCount,
                  createdAt: reviews.createdAt,
              })
              .from(reviews)
              .where(eq(reviews.installationId, installation.id))
              .orderBy(desc(reviews.createdAt))
              .limit(10)
        : [];

    return {
        appSlug: config.GITHUB_APP_SLUG,
        triggerPhrase: `@${config.GITHUB_APP_SLUG} review`,
        webhookEndpoint: `${config.BASE_URL}/webhooks/github`,
        queue: await getQueueStats(),
        installation: {
            existsLocally: !!installation,
            enabled: settings?.enabled ?? false,
            hasApiKey: !!settings?.hasApiKey,
            provider: settings?.provider ?? null,
            model: settings?.model ?? null,
        },
        recentWebhookTraces: listWebhookTraces({
            installationId: githubInstallationId,
            limit: 20,
        }),
        recentJobs: recentJobs.map((job) => ({
            ...job,
            createdAt: job.createdAt.toISOString(),
            startedAt: job.startedAt?.toISOString() ?? null,
            completedAt: job.completedAt?.toISOString() ?? null,
        })),
        recentReviews: recentReviews.map((review) => ({
            ...review,
            createdAt: review.createdAt.toISOString(),
        })),
    };
});
