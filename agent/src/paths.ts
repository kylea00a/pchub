import path from "node:path";

declare const process: NodeJS.Process & { pkg?: { entrypoint?: string } };

/** Writable folder beside agent.cjs / the .exe — not whatever the cwd happens to be. */
export function getAgentRoot(): string {
  if (process.pkg) {
    return path.dirname(process.execPath);
  }

  const entry = process.argv[1];
  if (entry && /\.(cjs|js|ts)$/.test(entry)) {
    return path.dirname(path.resolve(entry));
  }

  return process.cwd();
}
