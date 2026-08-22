/**
 * @sitt15/cli — public API surface.
 *
 * The CLI binary is the primary interface; these exports exist for programmatic
 * and testing use. Stability is best-effort until v1.
 */

export { VerificationEngine, type EngineDeps, type EngineRequest } from "./core/engine.js";
export type {
  AnalysisOutcome,
  AuditEvent,
  CapabilityMap,
  EvidenceRecord,
  Finding,
  RunMode,
  RunRepository,
  RunStatus,
  Severity,
  StageName,
  StageOutcome,
  TestSummary,
  VerificationRun,
  VerificationStatus,
} from "./core/contracts.js";
export { EXIT_CODES, exitCodeForRun, exitCodeForTestSummary } from "./core/exit-codes.js";
export { EngineError, ErrorCode, exitCodeForThrown } from "./core/errors.js";
export { DEFAULT_POLICY, policyFromConfig, type ExecutionPolicy } from "./core/policy.js";
export { canTransitionRun, transitionRun } from "./core/state-machine.js";
export { synthesizeStatus } from "./core/synthesis.js";
export { planStages } from "./core/planner.js";

export {
  CONFIG_DIR,
  CONFIG_FILE,
  defaultConfig,
  loadConfigFromDir,
  validateConfig,
  type NodeForgeConfig,
} from "./config/config.js";

export { DeterministicScanEngine } from "./scanners/deterministic.js";
export { BUILTIN_RULES } from "./scanners/rules.js";
export { normalizeFindings, findingFingerprint } from "./scanners/normalizer.js";

export { GuardedTestExecutor } from "./executors/test-runner.js";
export { checkCommandAllowed, buildChildEnv } from "./executors/sandbox.js";
export { parseRunnerOutput } from "./executors/parsers.js";

export { LocalSourceProvider } from "./context/repository.js";
export { GitHubSourceProvider, hasGitHubCredentials } from "./context/github.js";
export { detectCapabilities } from "./context/capability-map.js";
export { parseTarget } from "./context/repository.js";

export { createAnalysisProvider, resolveAnalysisKey } from "./analysis/provider.js";

export { createStorage } from "./storage/factory.js";
export { FilesystemRunRepository } from "./storage/filesystem.js";
export { MemoryRunRepository } from "./storage/memory.js";

export { EvidenceCollector } from "./evidence/evidence.js";
export { redactString, redactDeep, containsLikelySecret } from "./evidence/redaction.js";

export { renderRunJson } from "./reporters/json.js";
export { renderRunMarkdown } from "./reporters/markdown.js";
export { renderRunSarif } from "./reporters/sarif.js";
export { renderRunTerminal } from "./reporters/terminal.js";

export { Logger } from "./utils/logger.js";
export { setupShutdown } from "./utils/signals.js";
export { main, buildProgram } from "./cli.js";
