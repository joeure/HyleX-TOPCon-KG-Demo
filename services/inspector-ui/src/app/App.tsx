import { useEffect, useMemo, useState } from "react";
import { Globe2, Moon, Sun, UserRound } from "lucide-react";
import { fixtureGateway, type UiGatewayClient } from "../api/ui-gateway";
import { createHttpUiGatewayClient } from "../api/http-ui-gateway";
import type { UniverseView } from "../domain/universe";
import { enUS } from "../i18n/en-US";
import { zhCN } from "../i18n/zh-CN";
import { modes } from "./modes";
import { readPreferences, writePreferences, type PortalPreferences } from "./preferences";
import { QuerySearchShell } from "../features/query/QuerySearchShell";
import { IngestionWizard } from "../features/ingestion/IngestionWizard";
import { SpaceBackdrop } from "../features/universe/SpaceBackdrop";
import { UniverseExplorer } from "../features/universe/UniverseExplorer";
import { InspectorLogin } from "../features/auth/InspectorLogin";

const useFixtures = import.meta.env.VITE_USE_FIXTURES === "true";
const portalClient: UiGatewayClient = useFixtures
  ? fixtureGateway
  : createHttpUiGatewayClient(import.meta.env.VITE_UI_GATEWAY_URL ?? "");
const remoteGatewayEnabled = !useFixtures;

export default function App() {
  const [preferences, setPreferences] = useState<PortalPreferences>(readPreferences);
  const [preferenceRevision, setPreferenceRevision] = useState(0);
  const [view, setView] = useState<UniverseView | null>(null);
  const [preferencesHydrated, setPreferencesHydrated] = useState(!remoteGatewayEnabled);
  const [authenticated, setAuthenticated] = useState(!remoteGatewayEnabled);
  const [authReady, setAuthReady] = useState(!remoteGatewayEnabled);
  const [preferenceError, setPreferenceError] = useState("");
  const t = preferences.locale === "zh-CN" ? zhCN : enUS;
  useEffect(() => {
    if (!remoteGatewayEnabled) return;
    void portalClient.getSession().then(() => Promise.all([portalClient.getPreferences(), portalClient.getUniverse()])).then(([remotePreferences, remoteView]) => {
      setPreferences(remotePreferences); setPreferenceRevision(remotePreferences.revision); setView(remoteView); setAuthenticated(true); setPreferencesHydrated(true); setAuthReady(true);
    }).catch(() => { setPreferencesHydrated(true); setAuthReady(true); });
  }, []);
  useEffect(() => {
    if (remoteGatewayEnabled || preferences.mode !== "universe" || view) return;
    void portalClient.getUniverse().then(setView).catch(() => setView(null));
  }, [preferences.mode, view]);
  useEffect(() => { document.documentElement.dataset.theme = preferences.theme === "light" ? "light" : "dark"; writePreferences(preferences); }, [preferences]);
  const activeMode = useMemo(() => modes.find((mode) => mode.id === preferences.mode) ?? modes[0], [preferences.mode]);
  const setPreference = <K extends keyof PortalPreferences>(key: K, value: PortalPreferences[K]) => {
    const next = { ...preferences, [key]: value } as PortalPreferences;
    setPreferenceError("");
    setPreferences(next);
    if (key === "mode" && value === "universe" && remoteGatewayEnabled) {
      void portalClient.getUniverse().then(setView).catch(() => setView(null));
    }
    if (remoteGatewayEnabled && preferencesHydrated) {
      void portalClient.savePreferences({ ...next, revision: preferenceRevision }).then((saved) => setPreferenceRevision(saved.revision)).catch(async (cause) => {
        if (cause instanceof Error && cause.message.includes("409")) {
          const remote = await portalClient.getPreferences().catch(() => undefined);
          if (remote) { setPreferences(remote); setPreferenceRevision(remote.revision); }
          setPreferenceError(preferences.locale === "zh-CN" ? "偏好已被其他窗口更新，已重新加载" : "Preferences changed in another window; reloaded");
        }
      });
    }
  };
  useEffect(() => { const shortcuts = (event: KeyboardEvent) => { if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return; const mode = { "1": "universe", "2": "query", "3": "ingestion" }[event.key] as PortalPreferences["mode"] | undefined; if (mode) setPreference("mode", mode); }; window.addEventListener("keydown", shortcuts); return () => window.removeEventListener("keydown", shortcuts); });
  if (remoteGatewayEnabled && authReady && !authenticated) return <div className="portal"><SpaceBackdrop /><InspectorLogin locale={preferences.locale} client={portalClient} onSuccess={() => { setAuthenticated(true); setAuthReady(true); void portalClient.getPreferences().then((value) => { setPreferences(value); setPreferenceRevision(value.revision); }); void portalClient.getUniverse().then(setView); }} /></div>;
  if (remoteGatewayEnabled && !authReady) return <div className="portal"><SpaceBackdrop /><main className="login-layout"><div className="login-loading">{t.online}…</div></main></div>;
  return <div className="portal" data-testid="inspector-dashboard"><SpaceBackdrop /><div className="portal__content">
    <header className="topbar"><div className="brand"><div className="brand-mark"><Globe2 size={20} /></div><div className="brand-copy"><span className="eyebrow">{t.portal}</span><span className="brand-title">KG-OS · Coating</span></div></div>
      <nav className="mode-switcher" aria-label="Portal modes">{modes.map((mode) => <button key={mode.id} className={`mode-button ${activeMode.id === mode.id ? "active" : ""}`} onClick={() => setPreference("mode", mode.id)}>{preferences.locale === "zh-CN" ? mode.zh : mode.en}</button>)}</nav>
      <div className="topbar__actions"><button className="language-button" onClick={() => setPreference("locale", preferences.locale === "zh-CN" ? "en-US" : "zh-CN")} aria-label={t.language}><Globe2 size={15} /><span>{preferences.locale === "zh-CN" ? "中" : "EN"}</span></button><button className="icon-button" onClick={() => setPreference("theme", preferences.theme === "dark" ? "light" : "dark")} aria-label={t.theme}>{preferences.theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button><span className="user-chip"><UserRound size={14} /> {t.userLabel}</span></div>
    </header>
    {preferenceError && <div className="login-error" role="status">{preferenceError}</div>}
    {preferences.mode === "universe" && view ? <UniverseExplorer client={portalClient} initialView={view} /> : preferences.mode === "query" ? <QuerySearchShell locale={preferences.locale} client={portalClient} /> : preferences.mode === "ingestion" ? <IngestionWizard locale={preferences.locale} client={portalClient} /> : <main className="login-layout"><div className="login-loading">{t.online}…</div></main>}
    <footer className="bottom-bar"><span>{t.online} · {t.snapshotHint}</span><span><kbd>1</kbd> {modes[0].zh} &nbsp; <kbd>2</kbd> {modes[1].zh} &nbsp; <kbd>3</kbd> {modes[2].zh}</span></footer>
  </div></div>;
}
