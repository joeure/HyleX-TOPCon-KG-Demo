import { expect, test } from "@playwright/test";
import { reviewGraphToSceneModel, stepForBatchStatus } from "../src/features/ingestion/IngestionWizard";

test("review graph adapter keeps core nodes dimmed and delta nodes editable", () => {
  const scene = reviewGraphToSceneModel({
    nodes: [
      { id: "concept:Material", label: "Material", status: "core" },
      { id: "novel", label: "Novel", status: "delta" },
    ],
    edges: [
      { id: "core-signature", source: "concept:Material", target: "concept:Material", label: "PART_OF", status: "core" },
      { id: "e1", source: "novel", target: "concept:Material", label: "proposed_parent", status: "delta" },
    ],
  }, "scene-test");
  expect(scene.nodes).toHaveLength(2);
  expect(scene.nodes[0].dimmed).toBe(true);
  expect(scene.nodes[0].color).toBe("#858d9b");
  expect(scene.nodes[1].dimmed).toBe(false);
  expect(scene.nodes[1].color).toBe("#ff625f");
  expect(scene.edges).toHaveLength(2);
  expect(scene.edges[0]).toMatchObject({ predicate: "PART_OF", reviewStatus: "core" });
  expect(scene.edges[1].predicate).toBe("proposed_parent");
  expect(scene.edges[1].kind).toBe("inheritance");
  expect(scene.edges[1].from).toBe("concept:Material");
  expect(scene.edges[1].to).toBe("novel");
});

test("resumed batches land on the wizard step their status requires", () => {
  expect(stepForBatchStatus("running")).toBe("running");
  expect(stepForBatchStatus("awaiting_ontology_review")).toBe("ontology");
  expect(stepForBatchStatus("awaiting_kg_review")).toBe("kg");
  expect(stepForBatchStatus("ready_to_publish")).toBe("confirm");
  expect(stepForBatchStatus("published")).toBe("done");
});

test("audit graph hit targets stay transparent and zoom remains relative to its fitted overview", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "文档导入" }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "paper.pdf", mimeType: "application/pdf", buffer: Buffer.from("fixture pdf") });
  await page.getByRole("button", { name: "开始处理" }).click();
  await expect(page.getByTestId("ingestion-ontology")).toBeVisible({ timeout: 15_000 });

  const canvas = page.locator(".review-graph-workbench .universe-canvas-2d");
  const hitTarget = canvas.locator(".universe-node-hit").first();
  await expect(hitTarget).toBeVisible();
  const hitStyle = await hitTarget.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, border: style.borderTopWidth, width: style.width, height: style.height };
  });
  expect(hitStyle).toEqual({ background: "rgba(0, 0, 0, 0)", border: "0px", width: "30px", height: "30px" });

  const initialScale = Number(await canvas.getAttribute("data-2d-scale"));
  await canvas.getByRole("button", { name: "Zoom in" }).click();
  const zoomedScale = Number(await canvas.getAttribute("data-2d-scale"));
  expect(zoomedScale).toBeGreaterThan(initialScale);
  expect(zoomedScale).toBeLessThan(initialScale * 1.35);
  await canvas.getByRole("button", { name: "Zoom out" }).click();
  const restoredScale = Number(await canvas.getAttribute("data-2d-scale"));
  expect(restoredScale).toBeCloseTo(initialScale, 5);
});

test("guided ingestion walks upload → run → ontology → kg → preview → publish", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "文档导入" }).click();
  const wizard = page.getByTestId("ingestion-wizard");
  await expect(wizard).toHaveAttribute("data-step", "upload");

  await page.locator('input[type="file"]').setInputFiles({ name: "paper.pdf", mimeType: "application/pdf", buffer: Buffer.from("fixture pdf") });
  await page.getByRole("button", { name: "开始处理" }).click();
  await expect(page.getByTestId("ingestion-running")).toBeVisible();

  // The fixture gateway finishes extraction on the second poll.
  await expect(page.getByTestId("ingestion-ontology")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("灰色为现有本体，红色为本次新增提案。")).toBeVisible();
  await expect(page.getByTestId("review-graph-workbench")).toBeVisible();
  await page.getByRole("switch", { name: "Layer" }).click();
  await expect(page.getByTestId("review-graph-workbench")).toHaveAttribute("data-layer-mode", "true");
  await expect(page.getByText("NovelBinder", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "通过并继续" }).click();

  await expect(page.getByTestId("ingestion-kg")).toBeVisible();
  await page.getByRole("button", { name: "通过并继续" }).click();

  await expect(page.getByTestId("ingestion-confirm")).toBeVisible();
  await page.getByRole("button", { name: "预览" }).click();
  await expect(page.getByTestId("ingestion-preview")).toBeVisible();
  await page.getByRole("button", { name: "返回" }).click();
  await page.getByRole("button", { name: "确认导入" }).click();

  await expect(page.getByTestId("ingestion-done")).toBeVisible();
  await expect(page.getByText("kg_snapshot_fixture", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "继续导入下一个文档" }).click();
  await expect(wizard).toHaveAttribute("data-step", "upload");
});

test("deferred queue lists shelved batches and resumes them", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "文档导入" }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "shelved.pdf", mimeType: "application/pdf", buffer: Buffer.from("fixture pdf") });
  await page.getByRole("button", { name: "开始处理" }).click();
  await expect(page.getByTestId("ingestion-ontology")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "先不审计" }).click();
  await expect(page.getByTestId("ingestion-wizard")).toHaveAttribute("data-step", "upload");

  await page.getByRole("button", { name: /待审计队列/ }).click();
  const queue = page.getByTestId("ingestion-queue");
  await expect(queue).toBeVisible();
  await queue.locator(".ingestion-queue__item").first().click();
  await expect(page.getByTestId("ingestion-ontology")).toBeVisible({ timeout: 15_000 });
});
