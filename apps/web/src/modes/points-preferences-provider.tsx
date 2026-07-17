"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  DEFAULT_POINTS_PREFERENCES,
  persistPointsPreferences,
  POINTS_PREFERENCES_KEY,
  readPointsPreferences,
  type PointsPreferences,
} from "./points-preferences";

type PointsPreferencesContextValue = {
  preferences: PointsPreferences;
  savePreferences: (preferences: PointsPreferences) => void;
};

const defaultContext: PointsPreferencesContextValue = {
  preferences: DEFAULT_POINTS_PREFERENCES,
  savePreferences: () => undefined,
};

const PointsPreferencesContext =
  createContext<PointsPreferencesContextValue>(defaultContext);

export function PointsPreferencesProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [preferences, setPreferences] = useState(DEFAULT_POINTS_PREFERENCES);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      setPreferences(
        readPointsPreferences(
          window.localStorage.getItem(POINTS_PREFERENCES_KEY),
        ),
      );
    }, 0);
    return () => window.clearTimeout(initial);
  }, []);

  const savePreferences = useCallback((next: PointsPreferences) => {
    setPreferences(persistPointsPreferences(window.localStorage, next));
  }, []);
  const value = useMemo(
    () => ({ preferences, savePreferences }),
    [preferences, savePreferences],
  );

  return (
    <PointsPreferencesContext.Provider value={value}>
      <div
        data-four-color-suits={
          preferences.fourColorSuits ? "enabled" : "disabled"
        }
        data-history-density={
          preferences.compactHistory ? "compact" : "comfortable"
        }
      >
        {children}
      </div>
    </PointsPreferencesContext.Provider>
  );
}

export function usePointsPreferences(): PointsPreferencesContextValue {
  return useContext(PointsPreferencesContext);
}
