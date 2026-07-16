export interface CommandMetadata {
  readonly playerId: string;
  readonly expectedVersion?: number;
}

export type TableCommand = CommandMetadata &
  (
    | { readonly type: "fold" }
    | { readonly type: "check" }
    | { readonly type: "call" }
    | { readonly type: "bet"; readonly amount: number }
    | { readonly type: "raise"; readonly amount: number }
  );

export type GameEvent =
  | { readonly type: "player-folded"; readonly playerId: string }
  | { readonly type: "player-checked"; readonly playerId: string }
  | {
      readonly type: "player-called";
      readonly playerId: string;
      readonly amount: number;
    }
  | {
      readonly type: "player-bet";
      readonly playerId: string;
      readonly amount: number;
    }
  | {
      readonly type: "player-raised";
      readonly playerId: string;
      readonly amount: number;
      readonly fullRaise: boolean;
    }
  | { readonly type: "street-completed"; readonly phase: string };

export type LegalAction =
  | { readonly type: "fold" }
  | { readonly type: "check" }
  | { readonly type: "call"; readonly amount: number }
  | {
      readonly type: "bet" | "raise";
      readonly minAmount: number;
      readonly maxAmount: number;
    };
