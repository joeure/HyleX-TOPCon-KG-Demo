import { Network, X } from "lucide-react";
import type { UniverseNode, UniverseView } from "../../domain/universe";
import type { Locale } from "../../app/modes";

type Props = { node: UniverseNode; view: UniverseView; locale: Locale; onClose: () => void; };
export function UniverseDetailCard({ node, view, locale, onClose }: Props) {
  const label = locale === "zh-CN" ? node.label : node.labelEn;
  const description = locale === "zh-CN" ? node.description : ({ Process: "Processes and control steps for coating production.", Material: "Materials, formulations, and composition.", Equipment: "Production and characterization equipment.", Quality: "Performance, defects, and acceptance criteria.", Parameter: "Traceable process parameters.", Evidence: "Primary evidence supporting knowledge." }[node.labelEn] ?? "A connected concept in the knowledge universe.");
  return <aside className="detail-card" aria-label="Concept details">
    <div className="detail-card__top"><div><span className="eyebrow"><Network size={12} /> {node.layer} layer</span><h2>{label}</h2><p>{description}</p></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
    <div className="detail-card__meta"><div className="meta-line"><span>{locale === "zh-CN" ? "已关联节点" : "Linked nodes"}</span><strong>{node.count}</strong></div><div className="meta-line"><span>{locale === "zh-CN" ? "本体版本" : "Ontology version"}</span><strong>{view.ontologyVersion}</strong></div><div className="meta-line"><span>{locale === "zh-CN" ? "来源状态" : "Source status"}</span><strong>{locale === "zh-CN" ? "已验证" : "Verified"}</strong></div></div>
  </aside>;
}
