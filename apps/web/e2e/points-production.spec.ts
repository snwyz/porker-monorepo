import { expect, test } from "@playwright/test";

const excludedUi = /wallet|token|deposit|withdraw|web3|rpc/i;
const excludedRequest = /rpc|walletconnect|reown/i;

test("points production exposes the complete mode-neutral page system", async ({
  page,
}) => {
  const excludedRequests: string[] = [];
  page.on("request", (request) => {
    if (excludedRequest.test(request.url()))
      excludedRequests.push(request.url());
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Poker Next" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(excludedUi);

  await page.goto("/lobby");
  await expect(
    page.getByRole("heading", { name: "Public tables" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Balance" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(excludedUi);

  await page.getByRole("link", { name: "Balance" }).click();
  await expect(page).toHaveURL(/\/balance$/);
  await expect(
    page.getByRole("heading", { name: "Points balance" }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText(excludedUi);

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(
    page.getByRole("heading", { name: "Table preferences" }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText(excludedUi);

  const fourColor = page.getByRole("checkbox", { name: /Four-color suits/ });
  const compactHistory = page.getByRole("checkbox", {
    name: /Compact hand history/,
  });
  await expect(fourColor).not.toBeChecked();
  await expect(compactHistory).toBeChecked();
  await fourColor.check();
  await compactHistory.uncheck();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("status")).toHaveText("Preferences saved");
  await fourColor.uncheck();
  await expect(page.getByRole("status")).toHaveCount(0);
  await fourColor.check();
  await page.getByRole("button", { name: "Save preferences" }).click();

  await page.reload();
  await expect(fourColor).toBeChecked();
  await expect(compactHistory).not.toBeChecked();
  await page.getByRole("link", { name: "Tables" }).click();
  await expect(
    page.locator(
      '[data-four-color-suits="enabled"][data-history-density="comfortable"]',
    ),
  ).toBeVisible();

  expect(excludedRequests).toEqual([]);
});

test("room creation remains labelled and points-native", async ({ page }) => {
  await page.goto("/rooms/new");

  await expect(
    page.getByRole("heading", { name: "Create public table" }),
  ).toBeVisible();
  await expect(page.getByLabel("Room name")).toBeVisible();
  await expect(page.getByLabel("Seats")).toBeVisible();
  await expect(page.getByLabel("Small blind")).toBeVisible();
  await expect(page.getByLabel("Big blind")).toBeVisible();
  await expect(page.getByLabel("Minimum buy-in")).toBeVisible();
  await expect(page.getByLabel("Maximum buy-in")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(excludedUi);
});
