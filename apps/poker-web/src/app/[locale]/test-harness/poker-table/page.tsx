import { notFound } from "next/navigation";

import { NineSeatHarness } from "./nine-seat-harness";

export default function NineSeatHarnessPage() {
  if (process.env.POKER_ENABLE_TEST_HARNESS !== "1") notFound();
  return <NineSeatHarness />;
}
