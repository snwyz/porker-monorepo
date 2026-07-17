import { z } from "zod";

export const POINTS_PREFERENCES_KEY = "poker.points.preferences.v1";

export const PointsPreferencesSchema = z.object({
  version: z.literal(1),
  fourColorSuits: z.boolean(),
  compactHistory: z.boolean(),
});

export type PointsPreferences = z.infer<typeof PointsPreferencesSchema>;

export const DEFAULT_POINTS_PREFERENCES: PointsPreferences = Object.freeze({
  version: 1,
  fourColorSuits: false,
  compactHistory: true,
});

export function readPointsPreferences(raw: string | null): PointsPreferences {
  if (!raw) return DEFAULT_POINTS_PREFERENCES;
  try {
    const parsed = PointsPreferencesSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_POINTS_PREFERENCES;
  } catch {
    return DEFAULT_POINTS_PREFERENCES;
  }
}

export function persistPointsPreferences(
  storage: Pick<Storage, "setItem">,
  preferences: PointsPreferences,
): PointsPreferences {
  const validated = PointsPreferencesSchema.parse(preferences);
  storage.setItem(POINTS_PREFERENCES_KEY, JSON.stringify(validated));
  return validated;
}
