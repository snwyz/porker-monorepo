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
  await page.getByLabel("Buy-in", { exact: true }).fill("500");
  await page.getByRole("button", { name: "Join table" }).click();
  await expect(page.getByTestId("table-state")).toBeVisible();
}

test("guest creates, joins, plays, and cashes out", async ({ browser }) => {
  const suffix = Date.now().toString(36);
  const ownerContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const guest = await guestContext.newPage();
  const ownerSockets: string[] = [];
  owner.on("websocket", (socket) => ownerSockets.push(socket.url()));

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
  await expect(guest.getByTestId("hole-cards")).toContainText(
    /Your cards: [2-9TJQKA][cdhs]/,
  );
  expect(await guest.getByTestId("hole-cards").textContent()).not.toBe(
    await owner.getByTestId("hole-cards").textContent(),
  );
  expect(ownerSockets).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/^ws:\/\/127\.0\.0\.1:\d+\/socket\.io/),
    ]),
  );

  await ownerContext.setOffline(true);
  await expect(owner.getByTestId("connection-status")).toHaveText(
    "Reconnecting",
  );
  await ownerContext.setOffline(false);
  await expect(owner.getByTestId("connection-status")).toHaveText("Connected");
  await owner.waitForTimeout(2500);
  await expect(owner.getByTestId("version")).toHaveText("0");
  await expect(owner.getByRole("button", { name: "Fold" })).toBeEnabled();
  await owner.getByRole("button", { name: "Fold" }).click();
  await expect(owner.getByRole("button", { name: "Fold" })).toBeDisabled();
  await expect(owner.getByTestId("phase")).toHaveText("complete");

  await owner.getByRole("button", { name: "Leave table" }).click();
  await expect(owner).toHaveURL(/\/lobby$/);
  await expect(owner.getByTestId("points-balance")).toHaveText("9995");
  await owner.evaluate(() => {
    localStorage.setItem(
      "poker.points.guest",
      JSON.stringify({ nickname: "tampered", points: "1" }),
    );
  });
  const balanceResponse = owner.waitForResponse((response) =>
    response.url().includes("/api/game/v1/guest-session"),
  );
  await owner.reload();
  expect(await (await balanceResponse).json()).toMatchObject({
    points: "9995",
  });
  await expect(owner.getByTestId("points-balance")).toHaveText("9995");
  expect(
    await owner.evaluate(() =>
      Object.hasOwn(
        JSON.parse(localStorage.getItem("poker.points.guest")!),
        "points",
      ),
    ),
  ).toBe(false);

  await ownerContext.close();
  await guestContext.close();
});

test("uses authoritative legal raise ranges for larger blinds", async ({
  browser,
}) => {
  const suffix = `range${Date.now().toString(36)}`;
  const ownerContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const guest = await guestContext.newPage();

  await enterAs(owner, `RangeOwner${suffix}`.slice(0, 24));
  await owner.getByRole("link", { name: "Create room" }).click();
  await owner.getByLabel("Room name").fill(`High Blinds ${suffix}`);
  await owner.getByLabel("Seats").fill("2");
  await owner.getByLabel("Small blind").fill("25");
  await owner.getByLabel("Big blind").fill("50");
  await owner.getByLabel("Minimum buy-in").fill("100");
  await owner.getByLabel("Maximum buy-in").fill("1000");
  await owner.getByRole("button", { name: "Create table" }).click();
  await expect(owner).toHaveURL(/\/table\/[^/]+$/);
  const roomId = owner.url().split("/").at(-1)!;
  await joinTable(owner, 0);

  await enterAs(guest, `RangeGuest${suffix}`.slice(0, 24));
  await guest
    .getByTestId(`room-${roomId}`)
    .getByRole("link", { name: "Join" })
    .click();
  await joinTable(guest, 1);

  await expect(owner.getByTestId("amount-range")).toHaveText("100–500");
  await expect(owner.getByLabel("Amount")).toHaveValue("100");
  await owner.getByLabel("Amount").fill("99");
  await expect(owner.getByRole("button", { name: "Raise" })).toBeDisabled();
  await owner.getByLabel("Amount").fill("100");
  await expect(owner.getByRole("button", { name: "Raise" })).toBeEnabled();
  await owner.getByRole("button", { name: "Raise" }).click();
  await expect(owner.getByTestId("version")).toHaveText("1");
  await expect(guest.getByRole("button", { name: "Fold" })).toBeEnabled();
  await guest.getByRole("button", { name: "Fold" }).click();
  await expect(owner.getByTestId("phase")).toHaveText("complete");

  await ownerContext.close();
  await guestContext.close();
});
