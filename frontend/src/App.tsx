import { render } from "preact"
import { useState, useEffect, useCallback } from "preact/hooks"

const MODELS: Record<string, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  anthropic: ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5-20251001"],
  gemini: ["gemini-2.0-flash", "gemini-2.0-pro"],
}

interface User {
  username: string
  avatar: string
}

interface Installation {
  id: number
  account: string
  avatar: string
  type: string
  selection: string
}

interface Settings {
  installationId: number
  llmProvider: string
  llmModel: string
  reviewStyle: string
  hasApiKey: boolean
  ignorePaths: string[]
  customInstructions: string
  maxFilesPerReview: number
  enabled: boolean
}

type View = "loading" | "login" | "dashboard" | "settings"

function App() {
  const [view, setView] = useState<View>("loading")
  const [user, setUser] = useState<User | null>(null)
  const [installations, setInstallations] = useState<Installation[]>([])
  const [selectedInstallation, setSelectedInstallation] = useState<number | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [installUrl, setInstallUrl] = useState<string>("")

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me")
      if (res.ok) {
        const data = await res.json()
        setUser(data)
        setView("dashboard")
      } else {
        setView("login")
      }
    } catch {
      setView("login")
    }
  }, [])

  const fetchInstallations = useCallback(async () => {
    try {
      const res = await fetch("/api/installations")
      if (res.ok) {
        const data = await res.json()
        setInstallations(data.installations)
      }
    } catch (err) {
      console.error("Failed to fetch installations:", err)
    }
  }, [])

  const fetchInstallUrl = useCallback(async () => {
    try {
      const res = await fetch("/api/installations/install-url")
      if (res.ok) {
        const data = await res.json()
        setInstallUrl(data.url)
      }
    } catch (err) {
      console.error("Failed to fetch install URL:", err)
    }
  }, [])

  const fetchSettings = useCallback(async (installationId: number) => {
    try {
      const res = await fetch(`/api/installations/${installationId}/settings`)
      if (res.ok) {
        const data = await res.json()
        setSettings(data)
        setSelectedInstallation(installationId)
        setView("settings")
      }
    } catch (err) {
      console.error("Failed to fetch settings:", err)
    }
  }, [])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  useEffect(() => {
    if (view === "dashboard") {
      fetchInstallations()
      fetchInstallUrl()
    }
  }, [view, fetchInstallations, fetchInstallUrl])

  const handleLogin = () => {
    window.location.href = "/api/auth/github"
  }

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    setUser(null)
    setView("login")
  }

  const handleBackToDashboard = () => {
    setSettings(null)
    setSelectedInstallation(null)
    setView("dashboard")
  }

  if (view === "loading") {
    return (
      <div class="container">
        <div class="loading">Loading...</div>
      </div>
    )
  }

  if (view === "login") {
    return (
      <div class="container">
        <h1>ReviewBot</h1>
        <p class="subtitle">AI-powered PR reviews for your repositories</p>
        <button class="btn-primary btn-large" onClick={handleLogin}>
          Sign in with GitHub
        </button>
      </div>
    )
  }

  if (view === "settings" && settings) {
    return (
      <SettingsView
        settings={settings}
        installationId={selectedInstallation!}
        onBack={handleBackToDashboard}
        installations={installations}
      />
    )
  }

  return (
    <div class="container">
      <div class="header">
        <h1>ReviewBot</h1>
        <div class="user-info">
          <img src={user?.avatar} alt={user?.username} class="avatar" />
          <span>{user?.username}</span>
          <button class="btn-small" onClick={handleLogout}>Logout</button>
        </div>
      </div>

      <div class="section">
        <h2>Your Installations</h2>
        {installations.length === 0 ? (
          <div class="empty-state">
            <p>No installations yet. Install the app on a repository to get started.</p>
            <a href={installUrl} class="btn-primary">Install ReviewBot</a>
          </div>
        ) : (
          <div class="installations-grid">
            {installations.map((inst) => (
              <div key={inst.id} class="installation-card" onClick={() => fetchSettings(inst.id)}>
                <img src={inst.avatar} alt={inst.account} class="avatar-large" />
                <div class="installation-info">
                  <strong>{inst.account}</strong>
                  <span class="type-badge">{inst.type}</span>
                </div>
                <button class="btn-secondary">Configure</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {installations.length > 0 && (
        <div class="section">
          <a href={installUrl} class="btn-secondary">Install on another repository</a>
        </div>
      )}
    </div>
  )
}

function SettingsView({
  settings,
  installationId,
  onBack,
  installations,
}: {
  settings: Settings
  installationId: number
  onBack: () => void
  installations: Installation[]
}) {
  const [provider, setProvider] = useState(settings.llmProvider)
  const [model, setModel] = useState(settings.llmModel)
  const [reviewStyle, setReviewStyle] = useState(settings.reviewStyle)
  const [apiKey, setApiKey] = useState("")
  const [hasApiKey, setHasApiKey] = useState(settings.hasApiKey)
  const [ignorePaths, setIgnorePaths] = useState(settings.ignorePaths.join(", "))
  const [customInstructions, setCustomInstructions] = useState(settings.customInstructions)
  const [maxFiles, setMaxFiles] = useState(settings.maxFilesPerReview)
  const [enabled, setEnabled] = useState(settings.enabled)
  const [status, setStatus] = useState<{ type: string; msg: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const inst = installations.find((i) => i.id === installationId)

  const save = async () => {
    setSaving(true)
    setStatus(null)
    try {
      const res = await fetch(`/api/installations/${installationId}/settings`, {
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
      })
      const data = await res.json()
      if (res.ok) {
        setStatus({ type: "success", msg: "Settings saved!" })
        setApiKey("")
        setHasApiKey(true)
      } else {
        setStatus({ type: "error", msg: data.error || "Failed to save" })
      }
    } catch {
      setStatus({ type: "error", msg: "Network error" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div class="container">
      <div class="header">
        <button class="btn-back" onClick={onBack}>← Back</button>
        <h1>Settings</h1>
        {inst && (
          <div class="installation-badge">
            <img src={inst.avatar} alt={inst.account} class="avatar-small" />
            {inst.account}
          </div>
        )}
      </div>

      <div class="checkbox-row">
        <input
          type="checkbox"
          id="enabled"
          checked={enabled}
          onChange={(e) => setEnabled((e.target as HTMLInputElement).checked)}
        />
        <label htmlFor="enabled">Enable reviews</label>
      </div>

      <div class="row">
        <div>
          <label>LLM Provider</label>
          <select
            value={provider}
            onChange={(e) => {
              const v = (e.target as HTMLSelectElement).value
              setProvider(v)
              setModel(MODELS[v]?.[0] ?? "")
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

      <button class="btn-primary" onClick={save} disabled={saving}>
        {saving ? "Saving..." : "Save Settings"}
      </button>

      {status && <div class={`status ${status.type}`}>{status.msg}</div>}
    </div>
  )
}

render(<App />, document.getElementById("app")!)
