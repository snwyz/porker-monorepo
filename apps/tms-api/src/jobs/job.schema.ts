import { z } from "zod";

const providerModeSchema = z.enum([
  "auto",
  "codex-cli",
  "anthropic",
  "gemini",
  "openai-compatible",
]);

const messageCodeSchema = z.string().regex(/^P\d+$/, "Invalid message code");
const proposalSchema = z
  .object({
    "zh-CN": z.string(),
    code: messageCodeSchema,
    decision: z.enum(["PENDING_REVIEW", "APPROVED", "REJECTED"]),
    en: z.string(),
    params: z.array(z.number().int().nonnegative()),
    sources: z.array(z.string()),
  })
  .strict();

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
    status: z.enum(["QUEUED", "PENDING_REVIEW", "PUBLISHED", "PUBLISH_FAILED"]),
    proposals: z.array(proposalSchema).optional(),
    model: z.string().optional(),
  })
  .strict();

export type CreateJob = z.infer<typeof CreateJobSchema>;
export type Job = z.infer<typeof JobSchema>;
export type JobProposal = z.infer<typeof proposalSchema>;
