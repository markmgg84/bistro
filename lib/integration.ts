import type { Sale } from "./domain";
/** Internal boundary only: this does not describe or call a Wycash API. */
export interface RevenueImportSource {
  readonly name: string;
  read(input: { venueId: string; from: string; to: string }): Promise<Sale[]>;
}
/** Wycash adapter intentionally absent until official documentation is verified. */
export type IntegrationStatus = "NOT_CONFIGURED" | "READY" | "ERROR";
