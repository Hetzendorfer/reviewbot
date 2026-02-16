import { render } from "preact";
import { useState, useEffect } from "preact/hooks";

const MODELS: Record<string, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  anthropic: ["claude-sonnet-4-5-20250929", "claude-haiku-4-5-20251001"],
  gemini: ["gemini-2.0-flash", "gemini-2.0-pro"],
};

function App() {
  const params = new URLSearchParams(window.location.search);
  const installationId = params.get("installation_id") ?? "";

  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("gpt-4o");
  const [reviewStyle, setReviewStyle] = useState("both");
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [ignorePaths, setIgnorePaths] = useState(".lock, *.min.js, *.min.css");
  const [customInstructions, setCustomInstructions] = useState("");
  const [maxFiles, setMaxFiles] = useState(20);
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState<{ type: string; msg: string } | null>(null);

  useEffect(() => {
    if (!installationId) return;
    fetch(`/api/settings/${installationId}`)
      .then((r) => r.json())
      .then((data: any) => {
        setProvider(data.llmProvider);
        setModel(data.llmModel);
        setReviewStyle(data.reviewStyle);
        setHasApiKey(data.hasApiKey);
        setIgnorePaths((data.ignorePaths ?? []).join(", "));
        setCustomInstructions(data.customInstructions ?? "");
        setMaxFiles(data.maxFilesPerReview);
        setEnabled(data.enabled);
      })
      .catch(() => setStatus({ type: "error", msg: "Failed to load settings" }));
  }, [installationId]);

  const save = async () => {
    setStatus(null);
    try {
      const res = await fetch(`/api/settings/${installationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          llmProvider: provider,
          llmModel: model,
          reviewStyle,
          ...(apiKey ? { apiKey } : {}),
          ignorePaths: ignorePaths.split(",").map((s) => s.trim()).filter(Boolean),
          customInstructions,
          maxFilesPerReview: maxFiles,
          enabled,
        }),
      });
      if (res.ok) {
        setStatus({ type: "success", msg: "Settings saved!" });
        setApiKey("");
        setHasApiKey(true);
      } else {
        setStatus({ type: "error", msg: "Failed to save" });
      }
    } catch {
      setStatus({ type: "error", msg: "Network error" });
    }
  };

  if (!installationId) {
    return (
      <div class="container">
        <h1>ReviewBot</h1>
        <p class="subtitle">Missing installation_id parameter. Install the GitHub App first.</p>
      </div>
    );
  }

  return (
    <div class="container">
      <h1>ReviewBot Settings</h1>
      <p class="subtitle">Installation #{installationId}</p>

      <div class="checkbox-row">
        <input
          type="checkbox"
          id="enabled"
          checked={enabled}
          onChange={(e) => setEnabled((e.target as HTMLInputElement).checked)}
        />
        <label for="enabled" style={{ marginBottom: 0 }}>Enable reviews</label>
      </div>

      <div class="row">
        <div>
          <label>LLM Provider</label>
          <select
            value={provider}
            onChange={(e) => {
              const v = (e.target as HTMLSelectElement).value;
              setProvider(v);
              setModel(MODELS[v][0]);
            }}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="gemini">Google Gemini</option>
          </select>
        </div>
        <div>
          <label>Model</label>
          <select value={model} onChange={(e) => setModel((e.target as HTMLSelectElement).value)}>
            {(MODELS[provider] ?? []).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      <label>API Key {hasApiKey && "(already set - leave blank to keep)"}</label>
      <input
        type="password"
        value={apiKey}
        onInput={(e) => setApiKey((e.target as HTMLInputElement).value)}
        placeholder={hasApiKey ? "••••••••" : "Enter your API key"}
      />

      <label>Review Style</label>
      <select value={reviewStyle} onChange={(e) => setReviewStyle((e.target as HTMLSelectElement).value)}>
        <option value="both">Summary + Inline</option>
        <option value="inline">Inline Only</option>
        <option value="summary">Summary Only</option>
      </select>

      <label>Ignore Paths (comma-separated globs)</label>
      <input
        value={ignorePaths}
        onInput={(e) => setIgnorePaths((e.target as HTMLInputElement).value)}
      />

      <label>Max Files Per Review</label>
      <input
        type="number"
        value={maxFiles}
        onInput={(e) => setMaxFiles(parseInt((e.target as HTMLInputElement).value) || 20)}
      />

      <label>Custom Instructions</label>
      <textarea
        value={customInstructions}
        onInput={(e) => setCustomInstructions((e.target as HTMLTextAreaElement).value)}
        placeholder="Additional instructions for the reviewer..."
      />

      <button class="btn-primary" onClick={save}>Save Settings</button>

      {status && <div class={`status ${status.type}`}>{status.msg}</div>}
    </div>
  );
}

render(<App />, document.getElementById("app")!);
