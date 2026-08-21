/**
 * Stage planner: turns a run mode plus configuration into a fixed stage order.
 * The order is predictable so reports and audit trails are comparable across
 * runs; configuration may only disable optional stages, never reorder them.
 */

import type { RunMode, StageName } from "./contracts.js";
import type { NodeForgeConfig } from "../config/config.js";

export function planStages(mode: RunMode, config: NodeForgeConfig): StageName[] {
  const stages: StageName[] = ["prepare", "context", "capability_map"];
  if (mode === "review" || mode === "scan") {
    stages.push("deterministic_scan");
  }
  if (mode === "review" || mode === "test") {
    if (mode === "review" && !config.tests.enabled) {
      // Tests disabled by configuration: record discovery as skipped downstream.
      stages.push("test_discovery");
    } else {
      stages.push("test_discovery", "test_execution");
    }
  }
  if (mode === "review" && config.analysis.enabled) {
    stages.push("analysis");
  }
  stages.push("synthesis", "persistence");
  return stages;
}
