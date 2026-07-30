import { FormEvent, useState } from "react";
import { ArrowRight, Globe2, LockKeyhole } from "lucide-react";
import type { Locale } from "../../app/modes";
import type { UiGatewayClient, UiSession } from "../../api/ui-gateway";
import { zhCN } from "../../i18n/zh-CN";
import { enUS } from "../../i18n/en-US";

export function InspectorLogin({ locale, client, onSuccess }: { locale: Locale; client: UiGatewayClient; onSuccess: (session?: UiSession) => void }) {
  const t = locale === "zh-CN" ? zhCN : enUS;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [session, setSession] = useState<UiSession | null>(null);
  const [registering, setRegistering] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => { event.preventDefault(); setError(""); try { const nextSession = registering ? await client.register(inviteCode, username, password) : await client.login(username, password); if (nextSession.must_change_password) setSession(nextSession); else onSuccess(); } catch { setError(t.loginError); } };
  const changePassword = async (event: FormEvent) => { event.preventDefault(); setError(""); try { await client.changePassword(password, newPassword); onSuccess(); } catch { setError(t.passwordChangeError); } };
  return <main className="login-layout"><form className="login-card" onSubmit={session ? changePassword : submit}><div className="brand-mark"><Globe2 size={21} /></div><span className="eyebrow">{t.portal}</span><h1>{session ? t.passwordChangeTitle : registering ? "Register Public Demo" : t.loginTitle}</h1><p>{session ? t.passwordChangeHint : registering ? "Use a one-time evaluator invite." : t.loginHint}</p>{!session && <>{registering && <label><span>Invite code</span><input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} autoComplete="off" required /></label>}<label><span>{t.username}</span><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label><label><span>{t.password}</span><div className="password-input"><LockKeyhole size={15} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus minLength={registering ? 12 : 1} required /></div></label></>}{session && <label><span>{t.newPassword}</span><div className="password-input"><LockKeyhole size={15} /><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoFocus minLength={8} required /></div></label>}{error && <div className="login-error" role="alert">{error}</div>}<button className="login-submit" type="submit">{session ? t.savePassword : registering ? "Register" : t.login}<ArrowRight size={16} /></button>{!session && <button type="button" className="language-button" onClick={() => { setRegistering(!registering); setError(""); }}>{registering ? "Back to sign in" : "Register with invite"}</button>}</form></main>;
}
