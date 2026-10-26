import type { MapSaveOutcome } from "@/services/io/save";

export interface DepartureState {
  readonly busy: boolean;
  readonly stable: boolean;
  readonly editing: boolean;
}

export type DepartureIntent =
  | { readonly type: "cancel" }
  | { readonly type: "discard" }
  | { readonly type: "save"; readonly result: MapSaveOutcome };

export type DepartureDecision =
  | { readonly type: "discard-requested" }
  | {
      readonly type: "stay";
      readonly reason:
        | "cancelled"
        | "busy"
        | "unstable-model"
        | "edit-mode"
        | "save-cancelled"
        | "save-failed"
        | "save-invalidated"
        | "download-unconfirmed"
        | "saved-snapshot-only";
    };

/** Policy only, never a cached permit to replace a model. Save receipts do not prove current-document freshness. */
export function decideMapDeparture(intent: DepartureIntent, state: DepartureState): DepartureDecision {
  if (intent.type === "cancel") return { type: "stay", reason: "cancelled" };
  if (state.busy) return { type: "stay", reason: "busy" };
  if (!state.stable) return { type: "stay", reason: "unstable-model" };
  if (state.editing) return { type: "stay", reason: "edit-mode" };
  if (intent.type === "discard") return { type: "discard-requested" };

  switch (intent.result.type) {
    case "saved":
    case "stored":
      return { type: "stay", reason: "saved-snapshot-only" };
    case "downloaded-fallback":
      return { type: "stay", reason: "download-unconfirmed" };
    case "cancelled":
      return { type: "stay", reason: "save-cancelled" };
    case "failed":
      return { type: "stay", reason: "save-failed" };
    case "invalidated":
      return { type: "stay", reason: "save-invalidated" };
    case "busy":
      return { type: "stay", reason: "busy" };
    case "rejected":
      return { type: "stay", reason: intent.result.reason };
  }
}
