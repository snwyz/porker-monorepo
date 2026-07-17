import { z } from "zod";

const CatalogSchema = z.record(
  z.string(),
  z.array(z.number().int().nonnegative()),
);
const DictionarySchema = z.record(z.string(), z.string());

export const PublishedSnapshotSchema = z
  .object({
    version: z.number().int().positive(),
    catalog: CatalogSchema,
    en: DictionarySchema,
    "zh-CN": DictionarySchema,
  })
  .strict();

export type PublishedSnapshot = z.infer<typeof PublishedSnapshotSchema>;
