import { z } from "zod";

const providerModeSchema = z.enum([
  "auto",
  "codex-cli",
  "anthropic",
  "gemini",
  "openai-compatible",
]);

const messageCodeSchema = z.string().regex(/^P\d+$/, "Invalid message code");

export const JobIdSchema = z.string().uuid();

export const CreateJobSchema = z
  .object({
    codes: z.array(messageCodeSchema).min(1),
    provider: providerModeSchema,
  })
  .strict();

export const JobSchema = z
  .object({
    codes: z.array(messageCodeSchema).min(1),
    createdAt: z.string().datetime(),
    id: JobIdSchema,
    provider: providerModeSchema,
    status: z.literal("QUEUED"),
  })
  .strict();

export type CreateJob = z.infer<typeof CreateJobSchema>;
export type Job = z.infer<typeof JobSchema>;
