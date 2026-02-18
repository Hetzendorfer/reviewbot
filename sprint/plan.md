# Frontend Migration Runbook: Preact -> React + Tailwind + shadcn/ui

## Ziel
Migration des Frontends in `frontend/` von Preact auf React mit Tailwind CSS und shadcn/ui, ohne
Funktionsverlust bei Login, Dashboard und Settings.

## Definition of Done
- `frontend` baut ohne Fehler (`cd frontend && bun run build`)
- Frontend-Typecheck läuft gegen `frontend/tsconfig.json` (`cd frontend && bun run typecheck`)
- Login, Installationsliste und Settings speichern funktionieren manuell
- `index.html` enthält keine Inline-Styles mehr
- Einstiegspunkt ist `src/main.tsx` statt `src/App.tsx`

---

## Sprint 0: Vorbereitung (0.5 Tag)

### 0.1 Branch und Baseline
```bash
git checkout -b feat/frontend-react-migration
bun run --filter reviewbot-frontend dev
```

### 0.2 Ausgangslage dokumentieren
- Aktuell rendert Preact direkt in `src/App.tsx`
- Aktuell lädt `index.html` direkt `/src/App.tsx`
- Aktuell sind Styles inline in `index.html`

---

## Sprint 1: Tooling und Fundament (Tag 1)

### 1.1 Dependencies umstellen
```bash
cd frontend
bun remove preact @preact/preset-vite
bun add react react-dom clsx tailwind-merge class-variance-authority lucide-react
bun add -d @types/react @types/react-dom @vitejs/plugin-react tailwindcss postcss autoprefixer
bunx tailwindcss init -p
```

Hinweis: shadcn fügt benötigte `@radix-ui/*` Pakete später automatisch hinzu.

### 1.2 `frontend/package.json` Scripts ergänzen
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit"
  }
}
```

### 1.3 Vite auf React + Alias umstellen
Datei: `frontend/vite.config.ts`
```ts
import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    outDir: 'dist'
  }
})
```

### 1.4 TypeScript-Config korrekt für React + Alias
Datei: `frontend/tsconfig.json`
- `jsxImportSource: "preact"` entfernen
- `baseUrl` und `paths` für `@/*` hinzufügen

Zielzustand:
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

### 1.5 Entry-Point sauber trennen
Neue Datei: `frontend/src/main.tsx`
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

### 1.6 `index.html` auf `main.tsx` umstellen
Datei: `frontend/index.html`
- kompletten `<style>...</style>` Block entfernen
- Script auf `/src/main.tsx` ändern

Minimal:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ReviewBot</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### 1.7 Tailwind Basis anlegen
Datei: `frontend/tailwind.config.ts`
```ts
import type { Config } from 'tailwindcss'

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))'
      }
    }
  },
  plugins: []
} satisfies Config
```

Datei: `frontend/src/index.css`
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
  }
}
```

---

## Sprint 2: shadcn/ui Setup (Tag 1-2)

### 2.1 shadcn initialisieren
Hinweis: Dieser Befehl ist interaktiv und muss manuell ausgeführt werden.
```bash
cd frontend
bunx shadcn@latest init
```

Empfohlene Antworten:
- Style: `Default`
- Base color: `Slate`
- CSS Variables: `Yes`
- Tailwind config: `tailwind.config.ts`
- Tailwind CSS file: `src/index.css`
- Components: `src/components`
- Utilities: `src/lib/utils.ts`
- Alias: `@/*`
- React Server Components: `No`

### 2.2 Benötigte Komponenten generieren
```bash
bunx shadcn@latest add button card input select checkbox textarea badge avatar alert skeleton
```

### 2.3 `cn` Helper verifizieren
Datei: `frontend/src/lib/utils.ts`
```ts
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
```

---

## Sprint 3: React-Migration der bestehenden Logik (Tag 2-3)

### 3.1 Zielstruktur herstellen
```text
frontend/src/
  components/
    ui/
    LoginView.tsx
    DashboardView.tsx
    SettingsView.tsx
    InstallationCard.tsx
  lib/
    utils.ts
  types/
    index.ts
  App.tsx
  index.css
  main.tsx
```

### 3.2 Typen extrahieren
Datei: `frontend/src/types/index.ts`
- `User`
- `Installation`
- `Settings`
- optional `View` Union (`'loading' | 'login' | 'dashboard' | 'settings'`)

### 3.3 Kritische JSX/Event-Umstellung in `App.tsx`
- `import { render } from 'preact'` entfernen
- `import { useState, useEffect, useCallback } from 'react'` nutzen
- Alle `class=` auf `className=` ändern
- Alle `onInput` auf `onChange` ändern
- Event-Typen auf React-Typen umstellen (`React.ChangeEvent<HTMLInputElement>` usw.)
- `render(<App />, ...)` am Dateiende löschen, da `main.tsx` rendert

### 3.4 Komponenten splitten, Verhalten erhalten
- Login in `LoginView.tsx`
- Dashboard + Installationsliste in `DashboardView.tsx`
- Settings-Formular in `SettingsView.tsx`
- Karten-Item in `InstallationCard.tsx`

Akzeptanzkriterium: API-Requests und State-Flows bleiben identisch zum Preact-Stand.

---

## Sprint 4: UI mit shadcn/ui (Tag 3-4)

### 4.1 LoginView
- `Card` + `Button`
- klare Call-to-Action für GitHub Login

### 4.2 DashboardView
- `Avatar`, `Badge`, `Card`
- Empty-State als Card mit Install-Button

### 4.3 SettingsView
- `Input`, `Select`, `Textarea`, `Checkbox`
- `Alert` für Save-Status
- `Button` für Save und Back

### 4.4 Styling-Prinzip
- Nur Tailwind + shadcn Klassen
- Keine Inline-Styles
- Layout responsive ab Mobile-Breite

---

## Sprint 5: Verifikation und Abschluss (Tag 4-5)

### 5.1 Pflicht-Checks
```bash
cd frontend
bun run typecheck
bun run build
bun run dev
```

Zusätzlich in separater Shell vom Repo-Root:
```bash
bun run build:frontend
bun run --filter reviewbot-frontend typecheck
```

### 5.2 Manuelle Smoke-Tests
- [ ] Nicht eingeloggt: Login-Seite sichtbar
- [ ] Login startet GitHub OAuth (`/api/auth/github`)
- [ ] Nach Login: Installationen laden
- [ ] Installation anklicken: Settings laden
- [ ] Settings speichern zeigt Erfolg/Fehler korrekt
- [ ] Logout bringt zurück auf Login
- [ ] Mobile Layout bleibt bedienbar

### 5.3 Regression-Fokus
- [ ] `ignorePaths` Parsing korrekt (comma-separated -> Array)
- [ ] `maxFilesPerReview` bleibt numerisch
- [ ] API-Key Feld leert sich nach erfolgreichem Save
- [ ] `enabled` Checkbox serialisiert korrekt

---

## Exakte Datei-Checkliste

### Neu
- `frontend/src/main.tsx`
- `frontend/src/index.css`
- `frontend/src/types/index.ts`
- `frontend/src/components/LoginView.tsx`
- `frontend/src/components/DashboardView.tsx`
- `frontend/src/components/SettingsView.tsx`
- `frontend/src/components/InstallationCard.tsx`
- `frontend/tailwind.config.ts`
- `frontend/postcss.config.js`

### Geändert
- `frontend/package.json`
- `frontend/vite.config.ts`
- `frontend/tsconfig.json`
- `frontend/index.html`
- `frontend/src/App.tsx`

---

## Zeitplan
- Tag 1: Sprint 0-1
- Tag 2: Sprint 2
- Tag 2-3: Sprint 3
- Tag 3-4: Sprint 4
- Tag 4-5: Sprint 5

Gesamt: ca. 5 Tage
