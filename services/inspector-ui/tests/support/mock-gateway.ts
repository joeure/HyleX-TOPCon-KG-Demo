import type { Page, Route } from "@playwright/test";
import { fixtureUniverse } from "../../src/fixtures/universe";

export const mockGatewayRequests: Array<{ method: string; path: string; body: string }> = [];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

/** Install a deterministic, local-only Gateway contract for browser tests. */
export async function mockGateway(page: Page) {
  mockGatewayRequests.length = 0;
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
      return route.abort("blockedbyclient");
    }
    if (!url.pathname.startsWith("/auth/") && !url.pathname.startsWith("/inspector/")) {
      return route.continue();
    }
    mockGatewayRequests.push({ method: request.method(), path: `${url.pathname}${url.search}`, body: request.postData() ?? "" });
    if (url.pathname === "/auth/session") {
      return json(route, { user: { user_id: "demo", role: "inspector_demo", allowed_frontends: ["inspector-ui"] } });
    }
    if (url.pathname === "/auth/login") {
      return json(route, { user: { user_id: "demo", role: "inspector_demo", allowed_frontends: ["inspector-ui"] }, expires_at: "2099-01-01T00:00:00Z" });
    }
    if (url.pathname === "/inspector/preferences") {
      return json(route, { revision: 0, mode: "universe", locale: "zh-CN", theme: "dark", universe_view: {} });
    }
    if (url.pathname === "/inspector/universe") {
      return json(route, fixtureUniverse);
    }
    if (url.pathname.includes("/instances")) {
      return json(route, { snapshot_id: fixtureUniverse.snapshotId, items: [], total: 0, offset: 0, limit: 50 });
    }
    if (url.pathname === "/inspector/universe/neighborhood") {
      return json(route, { snapshot_id: fixtureUniverse.snapshotId, nodes: [], edges: [] });
    }
    if (url.pathname.startsWith("/inspector/universe/evidence/")) {
      return json(route, { evidence_id: url.pathname.split("/").pop(), snapshot_id: fixtureUniverse.snapshotId, excerpt: "Local mock evidence" });
    }
    if (url.pathname === "/inspector/query/options") {
      return json(route, { provider_sets: [{ provider_set_id: "fixture", label: "Fixture", execution_mode: "deterministic" }], snapshot: { snapshot_id: fixtureUniverse.snapshotId, ontology_version: fixtureUniverse.ontologyVersion } });
    }
    return json(route, { detail: "mock route" });
  });
}
