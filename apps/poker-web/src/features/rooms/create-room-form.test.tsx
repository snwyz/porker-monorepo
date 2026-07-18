// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateRoomSchema } from "@poker/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

const { createRoom, push } = vi.hoisted(() => ({
  createRoom: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ createRoom }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { I18nProvider } from "@poker/next-i18n/react";
import { CreateRoomForm } from "./create-room-form";

afterEach(() => {
  cleanup();
  createRoom.mockReset();
  push.mockReset();
});

describe("CreateRoomForm", () => {
  it("maps client validation failures to catalogued field errors", async () => {
    const user = userEvent.setup();
    const validation = CreateRoomSchema.safeParse({
      name: "Heads Up",
      seats: 1,
      smallBlind: 5,
      bigBlind: 10,
      minBuyIn: 100,
      maxBuyIn: 1000,
      actionTimeoutSeconds: 30,
    });
    if (validation.success) {
      throw new Error("Expected invalid room input");
    }
    const rawIssue = validation.error.issues[0]?.message;

    render(
      <I18nProvider initialLocale="en">
        <CreateRoomForm />
      </I18nProvider>,
    );

    await user.clear(screen.getByLabelText("Seats"));
    await user.type(screen.getByLabelText("Seats"), "1");
    await user.click(screen.getByRole("button", { name: "Create table" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Enter a valid value",
      );
    });
    expect(screen.queryByText(rawIssue ?? "")).not.toBeInTheDocument();
    expect(createRoom).not.toHaveBeenCalled();
  });

  it("uses a catalogued default room name and hides server failures", async () => {
    const user = userEvent.setup();
    createRoom.mockRejectedValueOnce(new Error("internal database hostname"));

    render(
      <I18nProvider initialLocale="en">
        <CreateRoomForm />
      </I18nProvider>,
    );

    expect(screen.getByLabelText("Room name")).toHaveValue("Heads Up");

    await user.click(screen.getByRole("button", { name: "Create table" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Could not create table",
      );
    });
    expect(
      screen.queryByText("internal database hostname"),
    ).not.toBeInTheDocument();
  });
});
