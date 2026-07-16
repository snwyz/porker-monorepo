import { expect, test, type Page } from "@playwright/test";

function boxesIntersect(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
) {
  return !(
    left.x + left.width <= right.x ||
    right.x + right.width <= left.x ||
    left.y + left.height <= right.y ||
    right.y + right.height <= left.y
  );
}

async function enterAs(page: Page, nickname: string) {
  await page.goto("/");
  await page.getByLabel("Nickname").fill(nickname);
  await page.getByRole("button", { name: "Play as guest" }).click();
  await expect(page).toHaveURL(/\/lobby$/);
}

async function joinTable(page: Page, seat: number) {
  await page.getByLabel("Seat").fill(String(seat));
  await page.getByLabel("Buy-in", { exact: true }).fill("500");
  await page.getByRole("button", { name: "Join table" }).click();
  await expect(page.getByTestId("table-state")).toBeVisible();
}

test("table remains usable without horizontal overflow at four target viewports", async ({
  browser,
}) => {
  const suffix = Date.now().toString(36);
  const ownerContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const guest = await guestContext.newPage();

  await enterAs(owner, `LayoutOwner${suffix}`.slice(0, 24));
  await owner.getByRole("link", { name: "Create room" }).click();
  await owner.getByLabel("Room name").fill(`Layout ${suffix}`);
  await owner.getByLabel("Seats").fill("9");
  await owner.getByLabel("Small blind").fill("5");
  await owner.getByLabel("Big blind").fill("10");
  await owner.getByLabel("Minimum buy-in").fill("100");
  await owner.getByLabel("Maximum buy-in").fill("1000");
  await owner.getByRole("button", { name: "Create table" }).click();
  await expect(owner).toHaveURL(/\/table\/[^/]+$/);
  const roomId = owner.url().split("/").at(-1)!;
  await joinTable(owner, 0);

  await enterAs(guest, `LayoutGuest${suffix}`.slice(0, 24));
  await expect(guest.getByTestId(`room-${roomId}`)).toBeVisible();
  await guest
    .getByTestId(`room-${roomId}`)
    .getByRole("link", { name: "Join" })
    .click();
  await joinTable(guest, 8);
  await expect(owner.getByTestId("poker-table")).toBeVisible();
  await expect(guest.getByTestId("poker-table")).toBeVisible();

  for (const viewport of [
    { width: 1440, height: 900, name: "desktop" },
    { width: 834, height: 1112, name: "tablet" },
    { width: 390, height: 844, name: "mobile-portrait" },
    { width: 844, height: 390, name: "mobile-landscape" },
  ]) {
    await owner.setViewportSize(viewport);
    const actionPanel = owner.getByTestId("action-panel");
    const primaryAction = actionPanel.locator("button:visible").last();
    const occupiedSeats = owner.locator('[data-testid^="player-seat-"]');
    const ownCards = owner
      .getByRole("region", { name: "Your cards" })
      .getByRole("img");

    await expect(occupiedSeats).toHaveCount(2);
    await expect(ownCards).toHaveCount(2);
    await expect(actionPanel).toBeInViewport();
    await expect(primaryAction).toBeInViewport();

    const panelBox = await actionPanel.boundingBox();
    const surfaceBox = await owner.getByTestId("table-surface").boundingBox();
    expect(panelBox, `${viewport.name} action panel box`).not.toBeNull();
    expect(surfaceBox, `${viewport.name} table surface box`).not.toBeNull();
    for (const item of [
      ...Array.from({ length: await occupiedSeats.count() }, (_, index) =>
        occupiedSeats.nth(index),
      ),
      ...Array.from({ length: await ownCards.count() }, (_, index) =>
        ownCards.nth(index),
      ),
    ]) {
      await expect(item).toBeVisible();
      await expect(item).toBeInViewport();
      await expect
        .poll(
          () =>
            item.evaluate((element) =>
              Number.parseFloat(getComputedStyle(element).opacity),
            ),
          { message: `${viewport.name} poker item reaches its visible state` },
        )
        .toBeGreaterThanOrEqual(0.99);
      const itemBox = await item.boundingBox();
      expect(itemBox, `${viewport.name} poker item box`).not.toBeNull();
      expect(
        itemBox!.x,
        `${viewport.name} poker item left edge is inside the felt`,
      ).toBeGreaterThanOrEqual(surfaceBox!.x - 1);
      expect(
        itemBox!.x + itemBox!.width,
        `${viewport.name} poker item right edge is inside the felt`,
      ).toBeLessThanOrEqual(surfaceBox!.x + surfaceBox!.width + 1);
      expect(
        itemBox!.y,
        `${viewport.name} poker item top edge is inside the felt`,
      ).toBeGreaterThanOrEqual(surfaceBox!.y - 1);
      expect(
        itemBox!.y + itemBox!.height,
        `${viewport.name} poker item bottom edge is inside the felt`,
      ).toBeLessThanOrEqual(surfaceBox!.y + surfaceBox!.height + 1);
      expect(
        boxesIntersect(itemBox!, panelBox!),
        `${viewport.name} poker item is obscured by the action panel`,
      ).toBe(false);
    }

    const dimensions = await owner.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(dimensions.documentWidth, viewport.name).toBeLessThanOrEqual(
      dimensions.viewportWidth,
    );
    await owner.screenshot({
      path: test.info().outputPath(`${viewport.name}.png`),
      fullPage: true,
    });
  }

  await ownerContext.close();
  await guestContext.close();
});
