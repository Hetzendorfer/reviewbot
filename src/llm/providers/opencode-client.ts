const OPENCODE_ZEN_CHAT_COMPLETIONS_URL =
  "https://opencode.ai/zen/v1/chat/completions";

type OpenCodeMessage = {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<{
        type: string;
        text?: string;
      }>;
};

type OpenCodeResponse = {
  choices?: Array<{
    message?: {
      content?: OpenCodeMessage["content"];
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  error?: {
    message?: string;
  };
};

export type OpenCodeTextResponse = {
  text: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
};

function extractMessageText(content: OpenCodeMessage["content"] | undefined): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

function getErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const error = (payload as { error?: { message?: unknown } }).error;
  if (error && typeof error.message === "string") {
    return error.message;
  }

  return undefined;
}

export async function generateOpenCodeText(
  apiKey: string,
  model: string,
  system: string,
  prompt: string,
  temperature = 0.1
): Promise<OpenCodeTextResponse> {
  const response = await fetch(OPENCODE_ZEN_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });

  const payload = (await response.json()) as OpenCodeResponse;

  if (!response.ok) {
    throw new Error(
      getErrorMessage(payload) ??
        `OpenCode request failed with status ${response.status}`
    );
  }

  const text = extractMessageText(payload.choices?.[0]?.message?.content);

  return {
    text,
    usage:
      payload.usage?.prompt_tokens !== undefined ||
      payload.usage?.completion_tokens !== undefined
        ? {
            inputTokens: payload.usage?.prompt_tokens ?? 0,
            outputTokens: payload.usage?.completion_tokens ?? 0,
          }
        : undefined,
  };
}
