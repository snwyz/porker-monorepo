"use client";

import Link from "next/link";
import { CreateRoomForm } from "@/features/rooms/create-room-form";
import { useI18n } from "@/i18n/provider";
import { PageIntro, PointsPage } from "@/modes/points-entry";

export default function NewRoomPage() {
  const { t } = useI18n();
  return (
    <PointsPage>
      <main className="max-w-3xl">
        <Link className="mb-5 inline-flex min-h-10 items-center" href="/lobby">
          ← {t("P000122")}
        </Link>
        <PageIntro eyebrow={t("P000123")} title={t("P000124")}>
          {t("P000125")}
        </PageIntro>
        <CreateRoomForm />
      </main>
    </PointsPage>
  );
}
