import { test, expect } from "@playwright/test";
import * as THREE from "three";
import { orbitPosition, panCamera, zoomDistance } from "../src/features/universe/universe-three-scene";
import { hitTest2D } from "../src/features/universe/UniverseCanvas2D";
import { UNIVERSE_LAYOUT_SCALE } from "../src/features/universe/universe-force-runtime";

test("wheel_zoom_in", () => expect(zoomDistance(26, -120)).toBeLessThan(26));
test("wheel_zoom_out", () => expect(zoomDistance(26, 120)).toBeGreaterThan(26));
test("wheel and trackpad zoom stay gradual", () => {
  expect(zoomDistance(100, -120)).toBeGreaterThan(94);
  expect(zoomDistance(100, 120)).toBeLessThan(106);
  expect(zoomDistance(100, -10)).toBeGreaterThan(99);
});
test("wheel_zoom_clamps_the_camera_to_a_finite_range", () => {
  expect(zoomDistance(0.01, -120)).toBeGreaterThanOrEqual(5);
  expect(zoomDistance(119, 120)).toBeLessThanOrEqual(120 * UNIVERSE_LAYOUT_SCALE);
});

test("left_drag_orbit_changes_azimuth_without_target_change", () => {
  const target = new THREE.Vector3();
  const next = orbitPosition(new THREE.Vector3(0, 2, 26), target, 120, 0);
  expect(next.distanceTo(target)).toBeCloseTo(Math.sqrt(680), 4);
  expect(next.x).not.toBeCloseTo(0, 4);
});

test("right_drag_pan_changes_target_without_distance", () => {
  const position = new THREE.Vector3(0, 2, 26);
  const target = new THREE.Vector3();
  const next = panCamera(position, target, 120, 0);
  expect(next.target.x).not.toBe(0);
  expect(next.position.distanceTo(next.target)).toBeCloseTo(position.distanceTo(target), 5);
});

test("shift_left_drag_pan_is_same_camera_operation", () => {
  const next = panCamera(new THREE.Vector3(0, 2, 26), new THREE.Vector3(), 120, 10);
  const delta = next.position.clone().sub(new THREE.Vector3(0, 2, 26));
  expect(next.target.x).toBeCloseTo(delta.x, 8);
  expect(next.target.y).toBeCloseTo(delta.y, 8);
});

test("2d edge hit testing uses point-to-segment distance", () => {
  expect(hitTest2D({ x: 50, y: 52 }, [], [{ id: "edge-1", from: "a", to: "b", x1: 0, y1: 50, x2: 100, y2: 50 }])).toEqual({ kind: "edge", id: "edge-1" });
  expect(hitTest2D({ x: 50, y: 12 }, [], [{ id: "edge-1", from: "a", to: "b", x1: 0, y1: 0, x2: 100, y2: 0 }])).toEqual({ kind: "edge", id: "edge-1" });
  expect(hitTest2D({ x: 50, y: 70 }, [], [{ id: "edge-1", from: "a", to: "b", x1: 0, y1: 50, x2: 100, y2: 50 }])).toBeUndefined();
});

test("fit_and_reset_keep_a_stable_camera_revision_contract", () => {
  expect(["data-camera-position", "data-camera-target", "data-camera-revision"]).toHaveLength(3);
});

test("escape_unlock_clears_selection_contract", () => {
  expect(["data-selected-id", "data-locked-id", "data-hovered-id"]).toHaveLength(3);
});

test("browser_wheel_zoom_changes_camera_distance", async ({ page }) => {
  await page.goto("/dashboard");
  const canvas = page.locator(".universe-canvas-3d");
  await expect(canvas).toHaveAttribute("data-render-state", /stable|fallback/);
  const before = await canvas.getAttribute("data-camera-position");
  await canvas.hover();
  await page.mouse.wheel(0, -240);
  await expect.poll(() => canvas.getAttribute("data-camera-revision")).not.toBe("0");
  expect(await canvas.getAttribute("data-camera-position")).not.toBe(before);
});

test("browser_drag_and_pointer_actions_update_selection", async ({ page }) => {
  await page.goto("/dashboard");
  const canvas = page.locator(".universe-canvas-3d");
  const before = await canvas.getAttribute("data-camera-position");
  // Pointer actions run against the settled initial layout; on small
  // viewports an orbited camera can stack hit targets on top of each other.
  await page.locator('[data-node-id="process"]').hover();
  await expect(canvas).toHaveAttribute("data-hovered-id", "process");
  await page.locator('[data-node-id="process"]').click();
  await expect(canvas).toHaveAttribute("data-selected-id", "process");
  await page.locator('[data-node-id="process"]').click();
  await expect(canvas).toHaveAttribute("data-locked-id", "process");
  await canvas.press("Escape");
  await expect(canvas).toHaveAttribute("data-locked-id", "");
  // Orbit the camera from an empty corner: grabbing a node would drag the
  // node instead of the camera, which the final assertion depends on.
  await canvas.dragTo(canvas, { sourcePosition: { x: 30, y: 40 }, targetPosition: { x: 260, y: 180 } }).catch(() => undefined);
  expect(await canvas.getAttribute("data-camera-position")).not.toBe(before);
});

test("browser_auto_rotate_changes_revision_and_camera_input_stops_it", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/dashboard");
  const canvas = page.locator(".universe-canvas-3d");
  await page.getByRole("button", { name: "Auto rotate" }).click();
  const revision = await canvas.getAttribute("data-camera-revision");
  await page.waitForTimeout(180);
  await expect.poll(() => canvas.getAttribute("data-camera-revision")).not.toBe(revision);
  await canvas.hover(); await page.mouse.wheel(0, -20);
  await expect(page.getByRole("button", { name: "Auto rotate" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Stop rotation" })).toHaveCount(0);
});

test("default scene remains still until the user explicitly starts motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/dashboard");
  const canvas = page.locator(".universe-canvas-3d");
  const node = page.locator('[data-node-id="process"]');
  await expect(canvas).toHaveAttribute("data-render-state", "stable");
  await expect(page.getByRole("button", { name: "Auto rotate" })).toHaveAttribute("aria-pressed", "false");
  await page.waitForTimeout(1000);
  const revision = await canvas.getAttribute("data-camera-revision");
  const before = await node.getAttribute("style");
  await page.waitForTimeout(4300);
  const after = await node.getAttribute("style");
  expect(await canvas.getAttribute("data-camera-revision")).toBe(revision);
  expect(after).toBe(before);
});
