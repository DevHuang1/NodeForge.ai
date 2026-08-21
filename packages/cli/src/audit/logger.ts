/**
 * Audit logger: append-only, redacted event stream per run.
 *
 * Every stage start/end, policy denial, command execution, evidence
 * registration, and cancellation flows through here. Metadata is deeply
 * redacted before it is written.
 */

import type { AuditAction, AuditEvent, RunRepository, StageName } from "../core/contracts.js";
import { newId, nowIso } from "../utils/misc.js";
import { redactDeep } from "../evidence/redaction.js";

export interface AuditOptions {
  stage?: StageName | null;
  outcome?: AuditEvent["outcome"];
  metadata?: Record<string, unknown>;
}

export class AuditLogger {
  constructor(
    private readonly repository: RunRepository,
    private readonly runId: string,
    private readonly actor: string = "nodeforge-cli"
  ) {}

  async record(action: AuditAction, options: AuditOptions = {}): Promise<AuditEvent> {
    const { value: cleanMetadata, appliedRules } = redactDeep(options.metadata ?? {});
    if (appliedRules.length > 0) {
      // Prove redaction happened inside the event itself.
      (cleanMetadata as Record<string, unknown>)["redactionRules"] = appliedRules;
    }
    const event: AuditEvent = {
      id: newId("evt"),
      runId: this.runId,
      at: nowIso(),
      actor: this.actor,
      action,
      stage: options.stage ?? null,
      outcome: options.outcome ?? "ok",
      metadata: cleanMetadata as Record<string, string | number | boolean | null>,
    };
    await this.repository.appendAudit(event);
    return event;
  }
}
