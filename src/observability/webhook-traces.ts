export interface WebhookTrace {
  id: string;
  timestamp: string;
  deliveryId: string | null;
  event: string | null;
  action: string | null;
  repoFullName: string | null;
  installationId: number | null;
  prNumber: number | null;
  stage: string;
  detail: string | null;
  ok: boolean;
}

interface RecordWebhookTraceInput {
  deliveryId?: string | null;
  event?: string | null;
  action?: string | null;
  repoFullName?: string | null;
  installationId?: number | null;
  prNumber?: number | null;
  stage: string;
  detail?: string | null;
  ok?: boolean;
}

interface ListWebhookTraceOptions {
  installationId?: number;
  repoFullName?: string;
  limit?: number;
}

const MAX_TRACE_COUNT = 200;
const traces: WebhookTrace[] = [];

export function recordWebhookTrace(input: RecordWebhookTraceInput): WebhookTrace {
  const entry: WebhookTrace = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    deliveryId: input.deliveryId ?? null,
    event: input.event ?? null,
    action: input.action ?? null,
    repoFullName: input.repoFullName ?? null,
    installationId: input.installationId ?? null,
    prNumber: input.prNumber ?? null,
    stage: input.stage,
    detail: input.detail ?? null,
    ok: input.ok ?? true,
  };

  traces.unshift(entry);
  if (traces.length > MAX_TRACE_COUNT) {
    traces.length = MAX_TRACE_COUNT;
  }

  return entry;
}

export function listWebhookTraces(
  options: ListWebhookTraceOptions = {}
): WebhookTrace[] {
  const { installationId, repoFullName, limit = 20 } = options;

  return traces
    .filter((entry) => {
      if (
        installationId !== undefined &&
        entry.installationId !== installationId
      ) {
        return false;
      }

      if (repoFullName !== undefined && entry.repoFullName !== repoFullName) {
        return false;
      }

      return true;
    })
    .slice(0, limit);
}

export function clearWebhookTraces(): void {
  traces.length = 0;
}
