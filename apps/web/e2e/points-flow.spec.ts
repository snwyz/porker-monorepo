import { expect, test, type Page } from "@playwright/test";

async function enterAs(page: Page, nickname: string) {
  await page.goto("/");
  await page.getByLabel("Nickname").fill(nickname);
  const sessionResponse = page.waitForResponse((response) =>
    response.url().includes("/api/game/v1/guest-session"),
  );
  await page.getByRole("button", { name: "Play as guest" }).click();
  expect((await sessionResponse).ok()).toBe(true);
  await expect(page).toHaveURL(/\/lobby$/);
  await expect(page.getByTestId("points-balance")).toContainText("10000");
}

async function joinTable(page: Page, seat: number) {
  await page.getByLabel("Seat").fill(String(seat));
  await page.getByLabel("Buy-in").fill("500");
  await page.getByRole("button", { name: "Join table" }).click();
  await expect(page.getByTestId("table-state")).toBeVisible();
}

test("guest creates, joins, plays, and cashes out", async ({ browser }) => {
  const suffix = Date.now().toString(36);
  const ownerContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const guest = await guestContext.newPage();

  await enterAs(owner, `RiverFox${suffix}`);
  await owner.getByRole("link", { name: "Create room" }).click();
  await owner.getByLabel("Room name").fill(`Heads Up ${suffix}`);
  await owner.getByLabel("Seats").fill("2");
  await owner.getByLabel("Small blind").fill("5");
  await owner.getByLabel("Big blind").fill("10");
  await owner.getByLabel("Minimum buy-in").fill("100");
  await owner.getByLabel("Maximum buy-in").fill("1000");
  await owner.getByRole("button", { name: "Create table" }).click();
  await expect(owner).toHaveURL(/\/table\/[^/]+$/);
  const roomId = owner.url().split("/").at(-1)!;
  await joinTable(owner, 0);

  await enterAs(guest, `TurnCard${suffix}`);
  await expect(guest.getByTestId(`room-${roomId}`)).toBeVisible();
  await guest
    .getByTestId(`room-${roomId}`)
    .getByRole("link", { name: "Join" })
    .click();
  await joinTable(guest, 1);

  await expect(owner.getByTestId("phase")).toHaveText("preflop");
  await expect(owner.getByTestId("pot")).toContainText("15");
  await expect(owner.getByTestId("current-bet")).toContainText("10");
  await expect(owner.getByTestId("hole-cards")).toContainText(
    /Your cards: [2-9TJQKA][cdhs]/,
  );
  await expect(owner.getByRole("button", { name: "Fold" })).toBeEnabled();
  await owner.getByRole("button", { name: "Fold" }).click();
  await expect(owner.getByRole("button", { name: "Fold" })).toBeDisabled();
  await expect(owner.getByTestId("phase")).toHaveText("complete");

  await owner.getByRole("button", { name: "Leave table" }).click();
  await expect(owner).toHaveURL(/\/lobby$/);
  await expect(owner.getByTestId("points-balance")).toHaveText("9995");

  await ownerContext.close();
  await guestContext.close();
});
