import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronRight, FileUp, Loader2, PanelRightOpen, Sparkles, X } from "lucide-react";
import type { Locale } from "../../app/modes";
import type { UiGatewayClient } from "../../api/ui-gateway";
import type { IngestionBatch, IngestionReview, ReviewGraph } from "../../domain/ingestion";
import { zhCN } from "../../i18n/zh-CN";
import { enUS } from "../../i18n/en-US";
import { ReviewGraphWorkbench, reviewGraphToSceneModel } from "./ReviewGraphWorkbench";

type Props = { locale: Locale; client: UiGatewayClient };
const publicDemo = import.meta.env.VITE_PUBLIC_DEMO === "true";
type WizardStep = "upload" | "running" | "ontology" | "kg" | "confirm" | "preview" | "done";

export { reviewGraphToSceneModel };

/** Which wizard step a resumed batch should land on. */
export function stepForBatchStatus(status: string): WizardStep {
  if (status === "running" || status === "queued") return "running";
  if (status === "awaiting_ontology_review") return "ontology";
  if (status === "awaiting_kg_review") return "kg";
  if (status === "ready_to_publish") return "confirm";
  if (status === "published") return "done";
  return "running";
}

export function IngestionWizard({ locale, client }: Props) {
  const t = locale === "zh-CN" ? zhCN : enUS;
  const publicCopy = locale === "zh-CN"
    ? { progress: ["上传", "处理", "候选预览", "等待处理", "完成"], queue: "我的候选", defer: "稍后查看", previewTitle: "候选结果预览", previewHint: "以下结果仅供你查看；公开用户不能执行审计、批准或发布。" }
    : { progress: ["Upload", "Process", "Candidate preview", "Pending", "Done"], queue: "My candidates", defer: "Review later", previewTitle: "Candidate preview", previewHint: "This result is for viewing only; public users cannot audit, approve, or publish." };
  const [step, setStep] = useState<WizardStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [batch, setBatch] = useState<IngestionBatch | null>(null);
  const [review, setReview] = useState<IngestionReview | null>(null);
  const [deferred, setDeferred] = useState<IngestionBatch[]>([]);
  const [queueOpen, setQueueOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeDocumentId, setActiveDocumentId] = useState("");
  const pollRef = useRef<number | undefined>(undefined);

  const refreshDeferred = () => {
    void client.listIngestionBatches().then((batches) => {
      setDeferred(batches.filter((item) => !["published", "ontology_rejected", "failed"].includes(item.status)));
    }).catch(() => setDeferred([]));
  };
  useEffect(refreshDeferred, [client, step]);

  useEffect(() => {
    if (step !== "running" || !batch) return undefined;
    const poll = async () => {
      try {
        const next = await client.getIngestionBatch(batch.batch_id);
        setBatch(next);
        if (next.status === "awaiting_ontology_review") {
          const nextReview = await client.getIngestionReview(next.batch_id);
          setReview(nextReview);
          setStep(publicDemo ? "preview" : "ontology");
        } else if (next.status === "failed") {
          setError(t.ingestionRunFailed);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t.ingestionRunFailed);
      }
    };
    pollRef.current = window.setInterval(() => void poll(), 1500);
    void poll();
    return () => window.clearInterval(pollRef.current);
  }, [step, batch?.batch_id, client]);

  const startRun = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      const uploaded = await client.uploadIngestionDocument(file);
      const created = await client.createIngestionBatch([uploaded.document_version_id]);
      setBatch(created);
      setStep("running");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.ingestionRunFailed);
    } finally {
      setBusy(false);
    }
  };

  const resumeBatch = async (item: IngestionBatch) => {
    setQueueOpen(false);
    setError("");
    setBatch(item);
    if (item.status !== "running" && item.status !== "queued") {
      const nextReview = await client.getIngestionReview(item.batch_id).catch(() => null);
      setReview(nextReview);
    }
    setStep(publicDemo ? "preview" : stepForBatchStatus(item.status));
  };

  const decideOntology = async (decision: "approved" | "rejected") => {
    if (!batch || !review || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await client.decideIngestionOntology(batch.batch_id, decision, review.review_revision);
      setBatch(next);
      const nextReview = await client.getIngestionReview(next.batch_id);
      setReview(nextReview);
      setStep(decision === "approved" ? "kg" : "upload");
      if (decision === "rejected") { setBatch(null); setReview(null); setFile(null); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.ingestionDecisionFailed);
    } finally {
      setBusy(false);
    }
  };

  const decideKg = async (decision: "approved" | "rejected") => {
    if (!batch || !review || busy) return;
    setBusy(true);
    setError("");
    try {
      let current = batch;
      let revision = review.review_revision;
      for (const document of review.documents) {
        current = await client.decideIngestionKg(current.batch_id, document.document_version_id, decision, revision);
        revision = current.review_revision;
      }
      setBatch(current);
      setReview(await client.getIngestionReview(current.batch_id));
      setStep(current.status === "ready_to_publish" ? "confirm" : "kg");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.ingestionDecisionFailed);
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!batch || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await client.publishIngestionBatch(batch.batch_id, ["zero_relations", "low_confidence_relations"]);
      setBatch(result.batch);
      setStep("done");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.ingestionPublishFailed);
    } finally {
      setBusy(false);
    }
  };

  const defer = () => {
    // Shelving keeps the batch waiting server-side; the wizard simply returns
    // to the start and the batch stays in the deferred queue.
    setBatch(null);
    setReview(null);
    setFile(null);
    setStep("upload");
    refreshDeferred();
  };

  const activeDocument = review?.documents.find((document) => document.document_version_id === activeDocumentId)
    ?? review?.documents[0];
  const previewScene = useMemo(() => {
    if (!review) return null;
    const merged: ReviewGraph = {
      nodes: [...(review.ontology.graph?.nodes ?? []), ...(review.documents[0]?.graph?.nodes ?? [])],
      edges: [...(review.ontology.graph?.edges ?? []), ...(review.documents[0]?.graph?.edges ?? [])],
    };
    return reviewGraphToSceneModel(merged, `preview-${batch?.batch_id ?? "draft"}`);
  }, [review, batch?.batch_id]);

  const stepIndex = { upload: 1, running: 2, ontology: 3, kg: 4, confirm: 5, preview: 5, done: 5 }[step];

  return <main className="ingestion-layout" data-testid="ingestion-wizard" data-step={step}>
    <section className="ingestion-panel">
      <div className="ingestion-topbar">
        <span className="eyebrow"><Sparkles size={12} /> {t.ingestionTitle}</span>
        <div className="ingestion-steps" aria-label={t.ingestionProgress}>
          {(publicDemo ? publicCopy.progress : [t.stepUpload, t.stepRun, t.stepOntology, t.stepKg, t.stepConfirm]).map((label, index) => (
            <span key={label} className={`ingestion-step ${index + 1 === stepIndex ? "active" : index + 1 < stepIndex ? "done" : ""}`}>
              {index + 1 < stepIndex ? <CheckCircle2 size={11} /> : null} {label}
            </span>
          ))}
        </div>
        <button type="button" className="history-toggle" aria-expanded={queueOpen} onClick={() => { setQueueOpen((value) => !value); refreshDeferred(); }}>
          <PanelRightOpen size={13} /> {publicDemo ? publicCopy.queue : t.deferredQueue}{deferred.length > 0 ? ` (${deferred.length})` : ""}
        </button>
      </div>
      {error && <div className="login-error" role="alert">{error}</div>}

      {step === "upload" && <div className="ingestion-stage">
        <label className="ingestion-drop">
          <FileUp size={30} />
          <strong>{file ? file.name : t.uploadPrompt}</strong>
          <span>{t.uploadHint}</span>
          <input type="file" accept=".pdf,.md,.txt" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </label>
        <div className="ingestion-actions">
          <button type="button" className="primary" disabled={!file || busy} onClick={() => void startRun()}>
            {busy ? t.uploading : t.startRun} <ChevronRight size={14} />
          </button>
        </div>
      </div>}

      {step === "running" && <div className="ingestion-stage" data-testid="ingestion-running">
        <div className="ingestion-running">
          <Loader2 size={30} className="ingestion-spinner" />
          <strong>{t.runningTitle}</strong>
          <span>{t.runningHint}</span>
          <ul>
            {(batch?.documents ?? []).map((document) => (
              <li key={document.document_version_id}>{document.filename} · {document.status === "running" ? t.statusRunning : document.status}</li>
            ))}
          </ul>
        </div>
        <div className="ingestion-actions">
          <button type="button" onClick={defer}>{publicDemo ? publicCopy.defer : t.deferAudit}</button>
        </div>
      </div>}

      {!publicDemo && step === "ontology" && review && <div className="ingestion-stage" data-testid="ingestion-ontology">
        <h2>{t.ontologyReviewTitle}</h2>
        <p className="ingestion-hint">{t.ontologyReviewHint}</p>
        <ReviewGraphWorkbench graph={review.ontology.graph} sceneId={`ontology-${batch?.batch_id ?? "draft"}`} title={t.ontologyReviewTitle} />
        <ul className="ingestion-list ingestion-list--summary">
          {(review.ontology.concepts ?? []).slice(0, 12).map((concept, index) => (
            <li key={index}><strong>{String(concept.preferred_label ?? concept.candidate_id ?? "")}</strong>{concept.definition ? ` · ${String(concept.definition)}` : ""}</li>
          ))}
          {(review.ontology.concepts ?? []).length > 12 && <li>+ {(review.ontology.concepts ?? []).length - 12} more proposals — select nodes in the graph to inspect them.</li>}
          {(review.ontology.concepts ?? []).length === 0 && <li>{t.noOntologyChanges}</li>}
        </ul>
        <div className="ingestion-actions">
          <button type="button" onClick={defer}>{t.deferAudit}</button>
          <button type="button" onClick={() => void decideOntology("rejected")} disabled={busy}>{t.rejectProposal}</button>
          <button type="button" className="primary" onClick={() => void decideOntology("approved")} disabled={busy}>{t.approveAndContinue} <ChevronRight size={14} /></button>
        </div>
      </div>}

      {!publicDemo && step === "kg" && review && <div className="ingestion-stage" data-testid="ingestion-kg">
        <h2>{t.kgReviewTitle}</h2>
        <p className="ingestion-hint">{activeDocument?.filename ?? ""} · {t.kgReviewHint}</p>
        {review.documents.length > 1 && <div className="review-document-tabs" role="tablist" aria-label="Source documents">
          {review.documents.map((document) => <button
            key={document.document_version_id}
            type="button"
            role="tab"
            aria-selected={document.document_version_id === activeDocument?.document_version_id}
            onClick={() => setActiveDocumentId(document.document_version_id)}
          >{document.filename ?? document.document_version_id}</button>)}
        </div>}
        {activeDocument && <ReviewGraphWorkbench graph={activeDocument.graph} sceneId={`kg-${batch?.batch_id ?? "draft"}-${activeDocument.document_version_id}`} title={activeDocument.filename ?? t.kgReviewTitle} />}
        <div className="ingestion-actions">
          <button type="button" onClick={() => setStep("ontology")}>{t.back}</button>
          <button type="button" onClick={defer}>{t.deferAudit}</button>
          <button type="button" onClick={() => void decideKg("rejected")} disabled={busy}>{t.rejectProposal}</button>
          <button type="button" className="primary" onClick={() => void decideKg("approved")} disabled={busy}>{t.approveAndContinue} <ChevronRight size={14} /></button>
        </div>
      </div>}

      {(step === "preview" || (!publicDemo && step === "confirm")) && <div className="ingestion-stage" data-testid="ingestion-confirm">
        <h2>{step === "preview" ? (publicDemo ? publicCopy.previewTitle : t.previewTitle) : t.confirmTitle}</h2>
        <p className="ingestion-hint">{step === "preview" ? (publicDemo ? publicCopy.previewHint : t.previewHint) : t.confirmHint}</p>
        {step === "preview" && <div data-testid="ingestion-preview">{previewScene && <ReviewGraphWorkbench graph={{
          nodes: previewScene.nodes.map((node) => ({ id: node.id, label: node.label, status: node.reviewStatus })),
          edges: previewScene.edges.map((edge) => ({ id: edge.stableKey, source: edge.from, target: edge.to, label: edge.predicate, status: edge.reviewStatus })),
        }} sceneId={`preview-${batch?.batch_id ?? "draft"}`} title={t.previewTitle} />}</div>}
        {step === "confirm" && <ul className="ingestion-list">
          <li>{t.confirmOntology}: {(review?.ontology.concepts ?? []).length}</li>
          <li>{t.confirmEntities}: {review?.documents.reduce((sum, document) => sum + (document.kg_delta?.entities?.length ?? 0), 0) ?? 0}</li>
          <li>{t.confirmRelations}: {review?.documents.reduce((sum, document) => sum + (document.kg_delta?.relations?.length ?? 0), 0) ?? 0}</li>
        </ul>}
        <div className="ingestion-actions">
          {step === "confirm" && <button type="button" onClick={() => setStep("kg")}>{t.back}</button>}
          {step === "confirm" && <button type="button" onClick={defer}>{t.deferAudit}</button>}
          {step === "confirm" && <button type="button" onClick={() => setStep("preview")}>{t.previewMerged}</button>}
          {step === "preview" && <button type="button" onClick={() => setStep("confirm")}>{t.back}</button>}
          {!publicDemo && <button type="button" className="primary" onClick={() => void publish()} disabled={busy}>{busy ? t.publishing : t.confirmPublish}</button>}
        </div>
      </div>}

      {step === "done" && <div className="ingestion-stage" data-testid="ingestion-done">
        <div className="ingestion-running">
          <CheckCircle2 size={34} />
          <strong>{t.doneTitle}</strong>
          <span>{batch?.snapshot_id ? `${t.doneSnapshot} ${batch.snapshot_id}` : t.doneHint}</span>
        </div>
        <div className="ingestion-actions">
          <button type="button" className="primary" onClick={() => { setBatch(null); setReview(null); setFile(null); setStep("upload"); }}>{t.startAnother}</button>
        </div>
      </div>}
    </section>

    {queueOpen && <aside className="ingestion-queue" aria-label={t.deferredQueue} data-testid="ingestion-queue">
      <div className="evidence-sidebar__top">
        <span>{t.deferredQueue}</span>
        <button type="button" className="icon-button" onClick={() => setQueueOpen(false)} aria-label={t.close}><X size={14} /></button>
      </div>
      {deferred.length === 0 && <p className="evidence-loading">{t.deferredEmpty}</p>}
      {deferred.map((item) => (
        <button key={item.batch_id} type="button" className="ingestion-queue__item" onClick={() => void resumeBatch(item)}>
          <strong>{item.documents[0]?.filename ?? item.batch_id}</strong>
          <span>{item.status}</span>
        </button>
      ))}
    </aside>}
  </main>;
}
