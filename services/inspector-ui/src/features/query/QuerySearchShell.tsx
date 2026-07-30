import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArrowUp, ChevronDown, FileText, MessageCircle, Plus, Search, Sparkles, X } from "lucide-react";
import type { Locale } from "../../app/modes";
import type { QueryConversation, QueryOptions, QueryRun } from "../../domain/query";
import type { InspectorCapabilities, UiGatewayClient } from "../../api/ui-gateway";
import { zhCN } from "../../i18n/zh-CN";
import { enUS } from "../../i18n/en-US";

type Props = { locale: Locale; client: UiGatewayClient };
type EvidenceState = { evidenceId: string; index: number; payload?: Record<string, unknown>; loading: boolean } | null;

function text(value: unknown, fallback = "—"): string {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function citationId(value: Record<string, unknown>): string | null {
  const id = value.evidence_id ?? value.evidenceId ?? value.chunk_id ?? value.chunkId ?? value.id;
  return id ? String(id) : null;
}

function runRetrieval(run: QueryRun): Array<Record<string, unknown>> {
  const retrieval = run.retrieval;
  if (retrieval?.channels && Array.isArray(retrieval.channels)) return retrieval.channels;
  if (Array.isArray(run.retrieval_channels)) return run.retrieval_channels;
  return [];
}

/** Split an answer into text fragments and `[n]` citation markers. */
export function splitAnswerIntoSegments(content: string): Array<{ kind: "text"; value: string } | { kind: "citation"; index: number }> {
  const segments: Array<{ kind: "text"; value: string } | { kind: "citation"; index: number }> = [];
  const pattern = /\[(\d{1,2})\]/g;
  let cursor = 0;
  for (let match = pattern.exec(content); match; match = pattern.exec(content)) {
    if (match.index > cursor) segments.push({ kind: "text", value: content.slice(cursor, match.index) });
    segments.push({ kind: "citation", index: Number(match[1]) });
    cursor = match.index + match[0].length;
  }
  if (cursor < content.length) segments.push({ kind: "text", value: content.slice(cursor) });
  return segments;
}

/** Human-readable evidence fields only; raw identifiers stay out of the reader's way. */
export function evidenceDisplayFields(payload: Record<string, unknown>): Array<{ key: string; value: string }> {
  const preferred: Array<[string, string[]]> = [
    ["excerpt", ["excerpt", "text", "quote", "chunk_text", "content"]],
    ["source", ["document_title", "source_title", "filename", "source_doc_title", "title"]],
    ["location", ["page_number", "page", "section"]],
    ["confidence", ["confidence", "score"]],
  ];
  const rows: Array<{ key: string; value: string }> = [];
  for (const [key, candidates] of preferred) {
    for (const candidate of candidates) {
      const value = payload[candidate];
      if (value !== undefined && value !== null && value !== "") {
        rows.push({ key, value: String(value) });
        break;
      }
    }
  }
  return rows;
}

const THINKING_ICONS = [Sparkles, Search, FileText];

export function QuerySearchShell({ locale, client }: Props) {
  const t = locale === "zh-CN" ? zhCN : enUS;
  const [options, setOptions] = useState<QueryOptions | null>(null);
  const [capabilities, setCapabilities] = useState<InspectorCapabilities | null>(null);
  const [conversations, setConversations] = useState<QueryConversation[]>([]);
  const [active, setActive] = useState<QueryConversation | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [error, setError] = useState("");
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [evidence, setEvidence] = useState<EvidenceState>(null);
  const [thinkingFrame, setThinkingFrame] = useState(0);
  const idempotencyKey = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([client.getQueryOptions(), client.listConversations(), client.getCapabilities()]).then(([nextOptions, nextConversations, nextCapabilities]) => {
      if (cancelled) return;
      const first = nextOptions.provider_sets[0];
      setOptions(nextOptions);
      setConversations(nextConversations);
      setActive(nextConversations[0] ?? null);
      setSelectedProviderId(first?.provider_set_id ?? "");
      setSelectedModelId(first?.default_answer_model_id ?? first?.models?.[0]?.answer_model_id ?? "default");
      setCapabilities(nextCapabilities);
    }).catch(() => { if (!cancelled) setError(t.queryUnavailable); });
    return () => { cancelled = true; };
  }, [client, locale]);

  const provider = useMemo(
    () => options?.provider_sets.find((item) => item.provider_set_id === selectedProviderId) ?? options?.provider_sets[0],
    [options, selectedProviderId],
  );
  const messages = active?.upstream?.messages ?? [];
  const runs = active?.upstream?.runs ?? [];
  const latestRun = runs[runs.length - 1];
  const citations = latestRun?.citations ?? [];
  const retrievalChannels = latestRun ? runRetrieval(latestRun) : [];
  const trace = latestRun?.safe_trace ?? [];
  const conversing = messages.length > 0 || Boolean(pendingQuestion);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, pendingQuestion, busy]);

  useEffect(() => {
    if (!busy) return undefined;
    const timer = window.setInterval(() => setThinkingFrame((value) => (value + 1) % THINKING_ICONS.length), 480);
    return () => window.clearInterval(timer);
  }, [busy]);

  const createConversation = async (): Promise<QueryConversation> => {
    setError("");
    const created = await client.createConversation();
    setConversations((current) => [created, ...current]);
    setActive(created);
    setEvidence(null);
    setHistoryOpen(false);
    return created;
  };

  const submit = async () => {
    const question = query.trim();
    if (!question || busy || !provider) return;
    setBusy(true);
    setError("");
    setPendingQuestion(question);
    setQuery("");
    const requestKey = idempotencyKey.current ?? crypto.randomUUID();
    idempotencyKey.current = requestKey;
    try {
      const conversation = active ?? await createConversation();
      const answerModel = selectedModelId || provider.default_answer_model_id || provider.models?.[0]?.answer_model_id || "default";
      await client.sendTurn(conversation.conversation_id, {
        question,
        provider_set_id: provider.provider_set_id,
        answer_model_id: answerModel,
        idempotency_key: requestKey,
      });
      const refreshed = await client.getConversation(conversation.conversation_id);
      setActive(refreshed);
      setConversations((current) => current.map((item) => item.conversation_id === refreshed.conversation_id ? refreshed : item));
      idempotencyKey.current = null;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t.queryFailed;
      setError(message);
      // Keep the key and question so a retry can safely replay the same request.
      setQuery(question);
    } finally {
      setPendingQuestion("");
      setBusy(false);
    }
  };

  const openEvidenceByIndex = async (index: number) => {
    const citation = citations[index - 1];
    if (!citation || !active) return;
    const evidenceId = citationId(citation);
    if (!evidenceId) return;
    setEvidence({ evidenceId, index, loading: true });
    try {
      const payload = await client.getEvidence(evidenceId, active.snapshot_id, active.conversation_id);
      setEvidence({ evidenceId, index, payload, loading: false });
    } catch (cause) {
      setEvidence({ evidenceId, index, payload: { error: cause instanceof Error ? cause.message : t.evidenceUnavailable }, loading: false });
    }
  };

  const archive = async () => {
    if (!active) return;
    try {
      await client.archiveConversation(active.conversation_id);
      const remaining = conversations.filter((item) => item.conversation_id !== active.conversation_id);
      setConversations(remaining);
      setActive(remaining[0] ?? null);
      setEvidence(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.archiveFailed);
    }
  };

  const renderAnswer = (content: string, isLatestAssistant: boolean) => {
    const segments = splitAnswerIntoSegments(content);
    const hasMarkers = segments.some((segment) => segment.kind === "citation");
    return <>
      <p>
        {segments.map((segment, index) => segment.kind === "text"
          ? <span key={index}>{segment.value}</span>
          : <button
              key={index}
              type="button"
              className="citation-marker"
              data-citation-index={segment.index}
              aria-label={`${t.citationsLabel} ${segment.index}`}
              onClick={() => void openEvidenceByIndex(segment.index)}
            >[{segment.index}]</button>)}
      </p>
      {isLatestAssistant && !hasMarkers && citations.length > 0 && (
        <span className="citation-row">
          {t.citationsLabel}
          {citations.map((citation, index) => (
            <button
              key={`${citationId(citation) ?? "citation"}-${index}`}
              type="button"
              className="citation-marker"
              data-citation-index={index + 1}
              aria-label={`${t.citationsLabel} ${index + 1}`}
              onClick={() => void openEvidenceByIndex(index + 1)}
            >[{index + 1}]</button>
          ))}
        </span>
      )}
    </>;
  };

  const credentialRequired = error.toLowerCase().includes("credential_required");
  const conflict = error.includes("409") || error.toLowerCase().includes("snapshot") || error.toLowerCase().includes("conversation_busy");
  const developerConsoleUrl = import.meta.env.VITE_DEVELOPER_CONSOLE_URL ?? `${window.location.protocol}//${window.location.hostname}:8501`;
  const lastAssistantIndex = messages.reduce((latest, message, index) => message.role === "assistant" ? index : latest, -1);
  const ThinkingIcon = THINKING_ICONS[thinkingFrame];

  return <main className={`ask-layout ${evidence ? "with-evidence" : ""}`} data-testid="query-shell" data-conversing={conversing}>
    <section className="ask-panel">
      <div className="query-topbar">
        <div className="history-menu">
          <button type="button" className="history-toggle" aria-expanded={historyOpen} onClick={() => setHistoryOpen((value) => !value)}>
            <MessageCircle size={13} /> {t.conversations} <ChevronDown size={12} />
          </button>
          {historyOpen && <div className="history-dropdown" role="menu" aria-label={t.conversations}>
            <button type="button" role="menuitem" onClick={() => void createConversation()}><Plus size={12} /> {t.newConversation}</button>
            {conversations.slice(0, 12).map((item) => (
              <button
                key={item.conversation_id}
                type="button"
                role="menuitem"
                className={active?.conversation_id === item.conversation_id ? "active" : ""}
                onClick={() => { setHistoryOpen(false); void client.getConversation(item.conversation_id).then(setActive); }}
              >{item.title || t.untitledConversation}</button>
            ))}
          </div>}
        </div>
        {active && conversing && <button type="button" className="icon-button" onClick={() => void archive()} aria-label={t.archiveConversation}><Archive size={14} /></button>}
      </div>
      {!conversing && <div className="ask-heading">
        <span className="eyebrow"><Sparkles size={12} /> {t.ask}</span>
        <h1>{t.ask}</h1>
        <p>{t.askHint}</p>
        <span className="snapshot-pill">{active?.snapshot_id ?? options?.snapshot.snapshot_id ?? "…"}</span>
      </div>}
      <div className={`conversation ${conversing ? "live" : ""}`} aria-live="polite" ref={scrollRef}>
        {!conversing && <div className="empty-conversation"><MessageCircle size={28} /><span>{t.askEmpty}</span></div>}
        {messages.map((message, index) => (
          <div className={`message ${message.role}`} key={`${message.role}-${index}`}>
            <span className="message-role">{message.role === "user" ? t.userLabel : "KG Query"}</span>
            {message.role === "assistant" ? renderAnswer(message.content, index === lastAssistantIndex) : <p>{message.content}</p>}
          </div>
        ))}
        {pendingQuestion && <div className="message user"><span className="message-role">{t.userLabel}</span><p>{pendingQuestion}</p></div>}
        {busy && <div className="message assistant thinking" data-testid="query-thinking">
          <span className="message-role">KG Query</span>
          <p><span className="thinking-icon"><ThinkingIcon size={14} /></span>{t.thinking}</p>
        </div>}
      </div>
      {error && <div className="login-error" role="alert">{error}
        {credentialRequired && <a href={developerConsoleUrl} className="gateway-link">{t.credentialHint}</a>}
        {conflict && <button className="inline-action" onClick={() => active && void client.getConversation(active.conversation_id).then(setActive)}>{t.refreshConversation}</button>}
      </div>}
      {capabilities && !capabilities.query.enabled && <div className="login-error" role="status">{capabilities.query.reason ?? t.noProvider}</div>}
      <div className="ask-composer">
        <textarea
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }}
          placeholder={t.askPlaceholder}
          aria-label={t.askPlaceholder}
          rows={1}
          disabled={busy}
        />
        <div className="composer-side">
          <button type="button" className="composer-send" onClick={() => void submit()} aria-label={t.send} disabled={busy || !provider}><ArrowUp size={17} /></button>
          <select
            className="model-select"
            aria-label={t.modelSelect}
            disabled={!options || options.provider_sets.length === 0 || conversing}
            value={provider?.provider_set_id ?? ""}
            onChange={(event) => {
              setSelectedProviderId(event.target.value);
              const next = options?.provider_sets.find((item) => item.provider_set_id === event.target.value);
              setSelectedModelId(next?.default_answer_model_id ?? next?.models?.[0]?.answer_model_id ?? "default");
            }}
          >
            {options?.provider_sets.length === 0 && <option value="">{t.noProvider}</option>}
            {options?.provider_sets.map((item) => <option key={item.provider_set_id} value={item.provider_set_id}>{item.label ?? item.provider_set_id}</option>)}
          </select>
        </div>
      </div>
      <span className="composer-hint">{t.composerHint}</span>
    </section>
    {evidence && <aside className="evidence-sidebar" role="complementary" aria-label={t.evidencePanel} data-testid="evidence-sidebar">
      <div className="evidence-sidebar__top">
        <span><FileText size={14} /> {t.citationsLabel} [{evidence.index}]</span>
        <button type="button" className="icon-button" onClick={() => setEvidence(null)} aria-label={t.collapseEvidence}><X size={14} /></button>
      </div>
      {evidence.loading ? <p className="evidence-loading">{t.loadingEvidence}</p> : (
        <div className="evidence-body">
          {evidenceDisplayFields(evidence.payload ?? {}).map((row) => (
            <div className="evidence-field" key={row.key}>
              <span className="evidence-field__label">{
                row.key === "excerpt" ? t.evidenceExcerpt
                : row.key === "source" ? t.evidenceSource
                : row.key === "location" ? t.evidenceLocation
                : t.evidenceConfidence
              }</span>
              {row.key === "excerpt" ? <blockquote>{row.value}</blockquote> : <span className="evidence-field__value">{row.value}</span>}
            </div>
          ))}
          {evidenceDisplayFields(evidence.payload ?? {}).length === 0 && <p className="evidence-loading">{text((evidence.payload ?? {}).error, t.evidenceUnavailable)}</p>}
          {retrievalChannels.length > 0 && <div className="retrieval-panel"><strong>{t.retrievalChannels}</strong>{retrievalChannels.map((channel, index) => <div className="retrieval-row" key={index}><span>{text(channel.channel ?? channel.name, `#${index + 1}`)}</span><small>{text(channel.status)}</small></div>)}</div>}
          {trace.length > 0 && <div className="retrieval-panel"><strong>{t.agentTrace}</strong>{trace.map((item, index) => <div className="trace-row" key={index}>{text(item.step ?? item.tool ?? item.status, `#${index + 1}`)}</div>)}</div>}
        </div>
      )}
    </aside>}
  </main>;
}
