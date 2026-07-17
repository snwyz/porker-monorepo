import { z } from "zod";

export const EditProposalSchema = z
  .object({
    "zh-CN": z.string(),
    decision: z.enum(["PENDING_REVIEW", "APPROVED", "REJECTED"]),
  })
  .strict();
