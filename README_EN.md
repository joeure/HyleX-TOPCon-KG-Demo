# HyleX TOPCon Public Demo

This public repository contains only the complete Inspector UI, the GitHub Pages build entry, synthetic Toy data, and public schemas/documentation. Core, Query, and UI Gateway source code, binaries, and OCI images are private deployment artifacts and are not published here.

GitHub Pages: `https://joeure.github.io/HyleX-TOPCon-KG-Demo/`

The Pages root is the complete three-mode Inspector: Knowledge Universe, Query/Search, and Document Ingestion. With no Gateway URL configured, Universe runs a read-only `toy_snapshot_v1` preview while Query and Ingestion remain visible and show accurate provider/backend readiness states. The production login, provider configuration, query, and upload calls run through the isolated VPS stack. Build the UI with Node.js 18+ from `services/inspector-ui` using `npm ci`, `npm run typecheck`, and `npm run build`.

`toy-data/` contains an entirely synthetic coating example with chunks, sample embeddings, ontology, entities, relations, and evidence links. It contains no real documents, provider values, credentials, or private repository identifiers.

Evaluators register with a one-time invite and receive the `public_inspector` role. The first online policy accepts public HTTPS OpenAI-compatible providers after SSRF checks; administrators may tighten it with `denied_hosts`. API keys stay in the current Gateway process Session Vault only. Users may browse the Toy Universe, configure Query/Extraction providers, and submit private candidate documents, but cannot audit, approve, decide, publish, promote, or read another user’s resources. Candidate data expires after 24 hours.

See [`EVALUATION-NOTICE.md`](EVALUATION-NOTICE.md), [`docs/DATA_AND_IP_NOTICE_CN.md`](docs/DATA_AND_IP_NOTICE_CN.md), and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) before redistribution.
