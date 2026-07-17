"use client";

import { CreateRoomSchema, type CreateRoomInput } from "@poker/shared";
import { Clock3, Coins, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { createRoom } from "@/lib/api";
import { useI18n } from "@/i18n/provider";

const defaults: CreateRoomInput = {
  name: "Heads Up",
  seats: 2,
  smallBlind: 5,
  bigBlind: 10,
  minBuyIn: 100,
  maxBuyIn: 1000,
  actionTimeoutSeconds: 30,
};

const inputClass =
  "min-h-11 border-[var(--border)] bg-[var(--background)] text-[var(--text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]";

export function CreateRoomForm() {
  const { t } = useI18n();
  const router = useRouter();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
  } = useForm<CreateRoomInput>({ defaultValues: defaults });

  const submit = handleSubmit(async (values) => {
    const parsed = CreateRoomSchema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0]) as keyof CreateRoomInput;
        if (field in defaults) setError(field, { message: issue.message });
      }
      return;
    }

    try {
      const room = await createRoom(parsed.data);
      router.push(`/table/${room.id}`);
    } catch (reason) {
      setError("root", {
        message:
          reason instanceof Error ? reason.message : "Could not create room",
      });
    }
  });

  return (
    <form className="gap-7 rounded-2xl p-6 sm:p-8" noValidate onSubmit={submit}>
      <section className="grid gap-4" aria-labelledby="room-basics">
        <div className="flex items-center gap-3">
          <Users aria-hidden="true" className="size-5 text-[var(--primary)]" />
          <h2 className="m-0 text-lg font-semibold" id="room-basics">
            {t("P00126")}
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
          <Field error={errors.name?.message} label={t("P00127")} name="name">
            <input
              aria-describedby={errors.name ? "name-error" : undefined}
              className={inputClass}
              id="name"
              {...register("name")}
            />
          </Field>
          <Field error={errors.seats?.message} label={t("P00128")} name="seats">
            <input
              aria-describedby={errors.seats ? "seats-error" : undefined}
              className={inputClass}
              id="seats"
              max={9}
              min={2}
              type="number"
              {...register("seats", { valueAsNumber: true })}
            />
          </Field>
        </div>
      </section>

      <section className="grid gap-4" aria-labelledby="stakes">
        <div className="flex items-center gap-3">
          <Coins aria-hidden="true" className="size-5 text-[var(--primary)]" />
          <h2 className="m-0 text-lg font-semibold" id="stakes">
            {t("P00129")}
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            error={errors.smallBlind?.message}
            label={t("P00130")}
            name="smallBlind"
          >
            <input
              aria-describedby={
                errors.smallBlind ? "smallBlind-error" : undefined
              }
              className={inputClass}
              id="smallBlind"
              min={1}
              type="number"
              {...register("smallBlind", { valueAsNumber: true })}
            />
          </Field>
          <Field
            error={errors.bigBlind?.message}
            label={t("P00131")}
            name="bigBlind"
          >
            <input
              aria-describedby={errors.bigBlind ? "bigBlind-error" : undefined}
              className={inputClass}
              id="bigBlind"
              min={2}
              type="number"
              {...register("bigBlind", { valueAsNumber: true })}
            />
          </Field>
          <Field
            error={errors.minBuyIn?.message}
            label={t("P00132")}
            name="minBuyIn"
          >
            <input
              aria-describedby={errors.minBuyIn ? "minBuyIn-error" : undefined}
              className={inputClass}
              id="minBuyIn"
              min={1}
              type="number"
              {...register("minBuyIn", { valueAsNumber: true })}
            />
          </Field>
          <Field
            error={errors.maxBuyIn?.message}
            label={t("P00133")}
            name="maxBuyIn"
          >
            <input
              aria-describedby={errors.maxBuyIn ? "maxBuyIn-error" : undefined}
              className={inputClass}
              id="maxBuyIn"
              min={1}
              type="number"
              {...register("maxBuyIn", { valueAsNumber: true })}
            />
          </Field>
        </div>
      </section>

      <Field
        error={errors.actionTimeoutSeconds?.message}
        label={t("P00134")}
        name="actionTimeoutSeconds"
      >
        <span className="relative">
          <Clock3
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]"
          />
          <select
            className={`${inputClass} w-full rounded-md border py-2 pl-10 pr-3`}
            id="actionTimeoutSeconds"
            {...register("actionTimeoutSeconds", { valueAsNumber: true })}
          >
            <option value={15}>{t("P00135", { 0: 15 })}</option>
            <option value={30}>{t("P00135", { 0: 30 })}</option>
            <option value={60}>{t("P00135", { 0: 60 })}</option>
          </select>
        </span>
      </Field>

      {errors.root ? (
        <p className="error m-0" role="alert">
          {errors.root.message}
        </p>
      ) : null}
      <Button
        className="w-full sm:w-auto"
        loading={isSubmitting}
        loadingText={t("P00136")}
        size="lg"
        type="submit"
      >
        {t("P00137")}
      </Button>
    </form>
  );
}

function Field({
  children,
  error,
  label,
  name,
}: {
  children: React.ReactNode;
  error?: string;
  label: string;
  name: string;
}) {
  return (
    <div className="grid content-start gap-1.5">
      <label className="text-sm font-medium" htmlFor={name}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="error m-0 text-xs" id={`${name}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
