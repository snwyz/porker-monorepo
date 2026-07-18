import { expect, test } from "@playwright/test";

test("web3 mode exposes the confirmed escrow flow", async ({ page }) => {
  await page.goto("/balance");

  await expect(
    page.getByRole("heading", { name: "Web3 balance" }),
  ).toBeVisible();
  await expect(page.getByTestId("wallet-token-balance")).toBeVisible();
  await expect(page.getByTestId("server-escrow-balance")).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect wallet" })).toBeVisible();
});
