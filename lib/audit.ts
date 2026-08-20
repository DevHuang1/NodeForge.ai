import type { AuditAction, AuditEvent } from "./types";
import { appendAuditEvent } from "./persistence";

export interface AuditInput {
  actor: string;
  action: AuditAction;
  entity: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

const VALID_ACTIONS = new Set<AuditAction>([
  "finding.approve",
  "finding.dismiss",
  "finding.request_revision",
  "finding.assign",
  "patch.approve",
  "patch.reject",
  "review.comment",
  "run.create",
  "run.reload",
  "version.publish",
  "version.rollback",
]);

export function assertAuditAction(action: AuditAction): void {
  if (!VALID_ACTIONS.has(action)) {
    throw new Error(`Unknown audit action: ${action}`);
  }
}

export async function recordAudit(input: AuditInput): Promise<AuditEvent> {
  assertAuditAction(input.action);
  return appendAuditEvent(input);
}

export async function recordRunCreated(runId: string, meta: Record<string, unknown>): Promise<void> {
  await recordAudit({ actor: "system", action: "run.create", entity: "review_run", entityId: runId, metadata: meta });
}