export type QueryProviderSet = {
  provider_set_id: string;
  label?: string;
  execution_mode?: string;
  provider_set?: { execution_mode?: string; answer_model_id?: string; [key: string]: unknown };
  models?: Array<{ answer_model_id: string; label?: string; model?: string }>;
  default_answer_model_id?: string;
  [key: string]: unknown;
};

export type QueryOptions = {
  provider_sets: QueryProviderSet[];
  snapshot: { snapshot_id: string; ontology_version: string; [key: string]: unknown };
};

export type QueryConversation = {
  conversation_id: string;
  snapshot_id: string;
  title: string;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
  upstream?: { messages?: QueryMessage[]; runs?: QueryRun[]; [key: string]: unknown };
};

export type QueryMessage = { role: "user" | "assistant"; content: string };
export type QueryRun = {
  run_id?: string;
  answer_status?: string;
  citations?: Array<Record<string, unknown>>;
  safe_trace?: Array<Record<string, unknown>>;
  retrieval?: { channels?: Array<Record<string, unknown>>; results?: Array<Record<string, unknown>>; [key: string]: unknown };
  retrieval_channels?: Array<Record<string, unknown>>;
  retrieval_results?: Array<Record<string, unknown>>;
  response?: Record<string, unknown>;
  [key: string]: unknown;
};

export type QueryTurn = {
  question: string;
  provider_set_id: string;
  answer_model_id: string;
  idempotency_key: string;
};
