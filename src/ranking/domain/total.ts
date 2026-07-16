import type { Confidence, Score, Verdict } from "./types";

/**
 * Totality guard. Placed in the `default`/else branch of a `switch` over a
 * closed union, it forces the compiler to prove exhaustiveness: if a new
 * variant is added and left unhandled, `x` is no longer `never` and the call
 * fails to type-check. The runtime throw is only reached if an impossible value
 * slips through at the boundary (e.g. malformed JSON).
 */
export function assertNever(x: never): never {
  throw new Error(`Non-exhaustive match: unexpected value ${JSON.stringify(x)}`);
}

/**
 * Smart constructor for {@link Score}: the only sanctioned way to mint one.
 * Clamps to the closed interval [1, 10] and rounds, so an out-of-range or
 * fractional `Score` is unrepresentable downstream.
 */
export function mkScore(raw: number): Score {
  return Math.max(1, Math.min(10, Math.round(raw))) as Score;
}

/**
 * Smart constructor for {@link Confidence}: clamps to the closed interval [0, 1]
 * so an out-of-range confidence is unrepresentable downstream.
 */
export function mkConfidence(raw: number): Confidence {
  return Math.max(0, Math.min(1, raw)) as Confidence;
}

/**
 * Total projection of a {@link Verdict} to the flat public score. Irrelevant
 * leads project to 0 — this sentinel lives ONLY at the API boundary, never in
 * the domain model.
 */
export function verdictScore(verdict: Verdict): number {
  switch (verdict.kind) {
    case "relevant":
      return verdict.score;
    case "excluded":
      return 0;
    default:
      return assertNever(verdict);
  }
}
