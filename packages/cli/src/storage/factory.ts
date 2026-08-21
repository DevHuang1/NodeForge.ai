/**
 * Storage factory: the persistence layer is replaceable by configuration.
 * Future backends (SQLite, PostgreSQL, hosted NodeForge API) implement the
 * same RunRepository interface.
 */

import path from "path";
import type { RunRepository } from "../core/contracts.js";
import type { NodeForgeConfig } from "../config/config.js";
import { FilesystemRunRepository } from "./filesystem.js";
import { MemoryRunRepository } from "./memory.js";

export function createStorage(config: NodeForgeConfig, cwd: string): RunRepository {
  switch (config.storage.backend) {
    case "memory":
      return new MemoryRunRepository();
    case "fs":
    default:
      return new FilesystemRunRepository(path.resolve(cwd, config.storage.dir));
  }
}

export { FilesystemRunRepository, MemoryRunRepository };
