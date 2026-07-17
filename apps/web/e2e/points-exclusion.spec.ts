import { expect, test } from "@playwright/test";

const excludedRequest = /rpc|walletconnect|reown/i;

test("fresh points build contains no Web3 surface or network traffic", async ({
  page,
}) => {
  const excludedRequests: string[] = [];
  page.on("request", (request) => {
    if (excludedRequest.test(request.url())) excludedRequests.push(request.url());
  });

  await page.goto("/balance");
  await expect(
    page.getByRole("heading", { name: "Points balance" }),
  ).toBeVisible();
  await expect(page.getByTestId("wallet-token-balance")).toHaveCount(0);
  await expect(page.getByTestId("server-escrow-balance")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /connect wallet/i })).toHaveCount(
    0,
  );
  expect(excludedRequests).toEqual([]);
});
