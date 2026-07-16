import { expect, test, type Locator, type Page } from "@playwright/test";

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

async function expectMotionAtRest(locator: Locator, message: string) {
  await expect
    .poll(
      () =>
        locator.evaluate((element) => {
          const transform = getComputedStyle(element).transform;
          if (transform === "none") return true;
          const matrix = new DOMMatrixReadOnly(transform);
          return [
            matrix.a - 1,
            matrix.b,
            matrix.c,
            matrix.d - 1,
            matrix.e,
            matrix.f,
          ].every((value) => Math.abs(value) < 0.01);
        }),
      { message },
    )
    .toBe(true);
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
    const communityCards = owner.getByRole("region", {
      name: "Community cards",
    });
    const compactHistory = owner.getByRole("button", { name: "Hand history" });
    const realTableInformation = [
      { locator: owner.getByTestId("phase"), name: "phase" },
      { locator: owner.getByTestId("pot"), name: "pot" },
    ];

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
      await expectMotionAtRest(
        item,
        `${viewport.name} poker item reaches its final transform`,
      );
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

    const seatBoxes = await Promise.all(
      Array.from({ length: await occupiedSeats.count() }, async (_, index) => ({
        box: (await occupiedSeats.nth(index).boundingBox())!,
        index,
      })),
    );
    const ownCardBoxes = await Promise.all(
      Array.from({ length: await ownCards.count() }, async (_, index) =>
        ownCards.nth(index).boundingBox(),
      ),
    );
    const communityBox = await communityCards.boundingBox();
    expect(
      communityBox,
      `${viewport.name} community cards region box`,
    ).not.toBeNull();
    expect(communityBox!.x).toBeGreaterThanOrEqual(surfaceBox!.x - 1);
    expect(communityBox!.y).toBeGreaterThanOrEqual(surfaceBox!.y - 1);
    expect(communityBox!.x + communityBox!.width).toBeLessThanOrEqual(
      surfaceBox!.x + surfaceBox!.width + 1,
    );
    expect(communityBox!.y + communityBox!.height).toBeLessThanOrEqual(
      surfaceBox!.y + surfaceBox!.height + 1,
    );
    expect(boxesIntersect(communityBox!, panelBox!)).toBe(false);

    for (const seat of seatBoxes) {
      for (const cardBox of ownCardBoxes) {
        expect(
          boxesIntersect(seat.box, cardBox!),
          `${viewport.name} seat ${seat.index} overlaps own cards: ${JSON.stringify(seat.box)} vs ${JSON.stringify(cardBox)}`,
        ).toBe(false);
      }
      expect(
        boxesIntersect(seat.box, communityBox!),
        `${viewport.name} seat ${seat.index} overlaps community cards: ${JSON.stringify(seat.box)} vs ${JSON.stringify(communityBox)}`,
      ).toBe(false);
    }
    for (const cardBox of ownCardBoxes) {
      expect(
        boxesIntersect(cardBox!, communityBox!),
        `${viewport.name} own cards overlap community cards: ${JSON.stringify(cardBox)} vs ${JSON.stringify(communityBox)}`,
      ).toBe(false);
    }

    const informationBoxes = [];
    for (const information of realTableInformation) {
      const informationBox = await information.locator.boundingBox();
      expect(
        informationBox,
        `${viewport.name} ${information.name} box`,
      ).not.toBeNull();
      expect(informationBox!.x).toBeGreaterThanOrEqual(surfaceBox!.x - 1);
      expect(informationBox!.y).toBeGreaterThanOrEqual(surfaceBox!.y - 1);
      expect(informationBox!.x + informationBox!.width).toBeLessThanOrEqual(
        surfaceBox!.x + surfaceBox!.width + 1,
      );
      expect(informationBox!.y + informationBox!.height).toBeLessThanOrEqual(
        surfaceBox!.y + surfaceBox!.height + 1,
      );
      expect(
        boxesIntersect(informationBox!, panelBox!),
        `${viewport.name} ${information.name} overlaps action panel: ${JSON.stringify(informationBox)} vs ${JSON.stringify(panelBox)}`,
      ).toBe(false);
      for (const seat of seatBoxes) {
        expect(
          boxesIntersect(informationBox!, seat.box),
          `${viewport.name} ${information.name} overlaps seat ${seat.index}: ${JSON.stringify(informationBox)} vs ${JSON.stringify(seat.box)}`,
        ).toBe(false);
      }
      for (const cardBox of ownCardBoxes) {
        expect(
          boxesIntersect(informationBox!, cardBox!),
          `${viewport.name} ${information.name} overlaps own cards: ${JSON.stringify(informationBox)} vs ${JSON.stringify(cardBox)}`,
        ).toBe(false);
      }
      informationBoxes.push({ box: informationBox!, name: information.name });
    }

    if (viewport.width < 1024) {
      await expect(compactHistory).toBeVisible();
      const historyBox = await compactHistory.boundingBox();
      expect(historyBox, `${viewport.name} history box`).not.toBeNull();
      for (const seat of seatBoxes) {
        expect(
          boxesIntersect(historyBox!, seat.box),
          `${viewport.name} history overlaps seat ${seat.index}: ${JSON.stringify(historyBox)} vs ${JSON.stringify(seat.box)}`,
        ).toBe(false);
      }
      for (const cardBox of [...ownCardBoxes, communityBox]) {
        expect(
          boxesIntersect(historyBox!, cardBox!),
          `${viewport.name} history overlaps cards: ${JSON.stringify(historyBox)} vs ${JSON.stringify(cardBox)}`,
        ).toBe(false);
      }
      for (const information of informationBoxes) {
        expect(
          boxesIntersect(historyBox!, information.box),
          `${viewport.name} history overlaps ${information.name}: ${JSON.stringify(historyBox)} vs ${JSON.stringify(information.box)}`,
        ).toBe(false);
      }
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

test("nine-player component remains fully usable at both mobile viewports", async ({
  page,
}) => {
  await page.goto("/test-harness/poker-table");
  await expect(page.getByTestId("poker-table")).toBeVisible();

  for (const viewport of [
    { width: 390, height: 844, name: "nine-seat-mobile-portrait" },
    { width: 844, height: 390, name: "nine-seat-mobile-landscape" },
  ]) {
    await page.setViewportSize(viewport);
    const surface = page.getByTestId("table-surface");
    const actionPanel = page.getByTestId("action-panel");
    const seats = page.locator('[data-testid^="player-seat-"]');
    const ownCards = page
      .getByRole("region", { name: "Your cards" })
      .getByRole("img");
    const communityCards = page
      .getByRole("region", { name: "Community cards" })
      .getByRole("img");
    const historyTrigger = page.getByRole("button", {
      name: "Hand history",
    });
    const tableInformation = [
      { locator: page.getByTestId("phase"), name: "phase" },
      { locator: page.getByTestId("pot"), name: "pot" },
      { locator: page.getByRole("timer"), name: "timer" },
    ];

    await expect(seats).toHaveCount(9);
    await expect(ownCards).toHaveCount(2);
    await expect(communityCards).toHaveCount(4);
    const surfaceBox = await surface.boundingBox();
    const panelBox = await actionPanel.boundingBox();
    expect(surfaceBox, `${viewport.name} table surface box`).not.toBeNull();
    expect(panelBox, `${viewport.name} action panel box`).not.toBeNull();

    const seatBoxes: Array<{
      box: { x: number; y: number; width: number; height: number };
      index: number;
    }> = [];
    for (let index = 0; index < 9; index += 1) {
      const seat = seats.nth(index);
      await expect
        .poll(() =>
          seat.evaluate((element) =>
            Number.parseFloat(getComputedStyle(element).opacity),
          ),
        )
        .toBeGreaterThanOrEqual(0.99);
      await expectMotionAtRest(
        seat,
        `${viewport.name} seat ${index} reaches its final transform`,
      );
      const seatBox = await seat.boundingBox();
      expect(seatBox, `${viewport.name} seat ${index} box`).not.toBeNull();
      expect(seatBox!.x).toBeGreaterThanOrEqual(surfaceBox!.x - 1);
      expect(seatBox!.y).toBeGreaterThanOrEqual(surfaceBox!.y - 1);
      expect(seatBox!.x + seatBox!.width).toBeLessThanOrEqual(
        surfaceBox!.x + surfaceBox!.width + 1,
      );
      expect(seatBox!.y + seatBox!.height).toBeLessThanOrEqual(
        surfaceBox!.y + surfaceBox!.height + 1,
      );
      expect(boxesIntersect(seatBox!, panelBox!)).toBe(false);
      for (const previous of seatBoxes) {
        expect(
          boxesIntersect(seatBox!, previous.box),
          `${viewport.name} seats ${previous.index}/${index} overlap: ${JSON.stringify(previous.box)} vs ${JSON.stringify(seatBox)}`,
        ).toBe(false);
      }
      seatBoxes.push({ box: seatBox!, index });
    }

    const ownCardBoxes = [];
    for (let index = 0; index < 2; index += 1) {
      const card = ownCards.nth(index);
      await expect
        .poll(() =>
          card.evaluate((element) =>
            Number.parseFloat(getComputedStyle(element).opacity),
          ),
        )
        .toBeGreaterThanOrEqual(0.99);
      await expectMotionAtRest(
        card,
        `${viewport.name} own card ${index} reaches its final transform`,
      );
      const cardBox = await card.boundingBox();
      expect(cardBox, `${viewport.name} own card ${index} box`).not.toBeNull();
      expect(cardBox!.x).toBeGreaterThanOrEqual(surfaceBox!.x - 1);
      expect(cardBox!.y).toBeGreaterThanOrEqual(surfaceBox!.y - 1);
      expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(
        surfaceBox!.x + surfaceBox!.width + 1,
      );
      expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(
        surfaceBox!.y + surfaceBox!.height + 1,
      );
      expect(boxesIntersect(cardBox!, panelBox!)).toBe(false);
      for (const seat of seatBoxes) {
        expect(
          boxesIntersect(cardBox!, seat.box),
          `${viewport.name} own card ${index} overlaps seat ${seat.index}: ${JSON.stringify(cardBox)} vs ${JSON.stringify(seat.box)}`,
        ).toBe(false);
      }
      for (const previous of ownCardBoxes) {
        expect(
          boxesIntersect(cardBox!, previous),
          `${viewport.name} own cards overlap: ${JSON.stringify(previous)} vs ${JSON.stringify(cardBox)}`,
        ).toBe(false);
      }
      ownCardBoxes.push(cardBox!);
    }

    const communityCardBoxes = [];
    for (let index = 0; index < 4; index += 1) {
      const card = communityCards.nth(index);
      await expect(card).toBeVisible();
      await expectMotionAtRest(
        card,
        `${viewport.name} community card ${index} reaches its final transform`,
      );
      const cardBox = await card.boundingBox();
      expect(
        cardBox,
        `${viewport.name} community card ${index} box`,
      ).not.toBeNull();
      for (const ownCardBox of ownCardBoxes) {
        expect(
          boxesIntersect(cardBox!, ownCardBox),
          `${viewport.name} community card ${index} overlaps own cards: ${JSON.stringify(cardBox)} vs ${JSON.stringify(ownCardBox)}`,
        ).toBe(false);
      }
      for (const previous of communityCardBoxes) {
        expect(
          boxesIntersect(cardBox!, previous),
          `${viewport.name} community cards overlap: ${JSON.stringify(previous)} vs ${JSON.stringify(cardBox)}`,
        ).toBe(false);
      }
      communityCardBoxes.push(cardBox!);
    }

    await expect(historyTrigger).toBeVisible();
    const historyBox = await historyTrigger.boundingBox();
    expect(historyBox, `${viewport.name} history trigger box`).not.toBeNull();
    expect(historyBox!.x).toBeGreaterThanOrEqual(surfaceBox!.x - 1);
    expect(historyBox!.y).toBeGreaterThanOrEqual(surfaceBox!.y - 1);
    expect(historyBox!.x + historyBox!.width).toBeLessThanOrEqual(
      surfaceBox!.x + surfaceBox!.width + 1,
    );
    expect(historyBox!.y + historyBox!.height).toBeLessThanOrEqual(
      surfaceBox!.y + surfaceBox!.height + 1,
    );
    for (const seat of seatBoxes) {
      expect(
        boxesIntersect(historyBox!, seat.box),
        `${viewport.name} history trigger overlaps seat ${seat.index}: ${JSON.stringify(historyBox)} vs ${JSON.stringify(seat.box)}`,
      ).toBe(false);
    }

    for (const information of tableInformation) {
      await expect(information.locator).toBeVisible();
      const informationBox = await information.locator.boundingBox();
      expect(
        informationBox,
        `${viewport.name} ${information.name} box`,
      ).not.toBeNull();
      for (const cardBox of [...communityCardBoxes, ...ownCardBoxes]) {
        expect(
          boxesIntersect(informationBox!, cardBox),
          `${viewport.name} ${information.name} overlaps cards: ${JSON.stringify(informationBox)} vs ${JSON.stringify(cardBox)}`,
        ).toBe(false);
      }
      for (const seat of seatBoxes) {
        expect(
          boxesIntersect(informationBox!, seat.box),
          `${viewport.name} ${information.name} overlaps seat ${seat.index}: ${JSON.stringify(informationBox)} vs ${JSON.stringify(seat.box)}`,
        ).toBe(false);
      }
    }

    const dimensions = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(dimensions.documentWidth).toBeLessThanOrEqual(
      dimensions.viewportWidth,
    );
    await page.screenshot({
      path: test.info().outputPath(`${viewport.name}.png`),
      fullPage: true,
    });
  }
});
