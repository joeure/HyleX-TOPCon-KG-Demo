# HyleX TOPCon Public Demo

This public repository contains only the Inspector UI, the GitHub Pages showcase, synthetic Toy data, and public schemas/documentation. Core, Query, and UI Gateway source code, binaries, and OCI images are private deployment artifacts and are not published here.

GitHub Pages: `https://joeure.github.io/HyleX-TOPCon-KG-Demo/`

Build the public UI with Node.js 18+ from `services/inspector-ui` using `npm ci`, `npm run typecheck`, and `npm run build`. Pages is static; the interactive Inspector, login, provider configuration, query, and upload services run in an isolated VPS stack.

`toy-data/` contains an entirely synthetic coating example with chunks, sample embeddings, ontology, entities, relations, and evidence links. It contains no real documents, provider values, credentials, or private repository identifiers.

Evaluators register with a one-time invite and receive the `public_inspector` role. The provider allowlist starts empty and is updated only after approved evaluator API hosts are supplied. Users may browse the Toy Universe and submit private candidate documents, but cannot audit, approve, decide, publish, promote, or read another user’s resources. Candidate data expires after 24 hours.

See [`EVALUATION-NOTICE.md`](EVALUATION-NOTICE.md), [`docs/DATA_AND_IP_NOTICE_CN.md`](docs/DATA_AND_IP_NOTICE_CN.md), and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) before redistribution.
