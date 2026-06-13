import path from "node:path";

declare const process: NodeJS.Process & { pkg?: { entrypoint?: string } };

/** Writable folder beside the .exe (packaged) or agent package root (dev). */
export function getAgentRoot(): string {
  if (process.pkg) {
    return path.dirname(process.execPath);
  }
  return process.cwd();
}
