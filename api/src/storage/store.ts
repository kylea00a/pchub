import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..", "data", "cloud-storage");

export type StoredFile = {
  path: string;
  size: number;
  sha256: string;
  updatedAt: string;
};

export type StorageManifest = {
  profileId: string;
  version: number;
  updatedAt: string;
  files: StoredFile[];
  totalBytes: number;
};

export type FileUpload = {
  path: string;
  contentBase64: string;
};

function profileDir(profileId: string) {
  const safe = profileId.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(ROOT, safe);
}

function manifestPath(profileId: string) {
  return path.join(profileDir(profileId), "manifest.json");
}

function filesDir(profileId: string) {
  return path.join(profileDir(profileId), "files");
}

function ensureProfile(profileId: string) {
  const dir = profileDir(profileId);
  const fdir = filesDir(profileId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(fdir)) fs.mkdirSync(fdir, { recursive: true });
}

function normalizePath(filePath: string) {
  const cleaned = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (cleaned.includes("..")) {
    throw new Error("Invalid file path");
  }
  return cleaned;
}

export function readManifest(profileId: string): StorageManifest {
  ensureProfile(profileId);
  const mp = manifestPath(profileId);
  if (!fs.existsSync(mp)) {
    return {
      profileId,
      version: 1,
      updatedAt: new Date(0).toISOString(),
      files: [],
      totalBytes: 0,
    };
  }
  return JSON.parse(fs.readFileSync(mp, "utf8")) as StorageManifest;
}

function writeManifest(manifest: StorageManifest) {
  ensureProfile(manifest.profileId);
  fs.writeFileSync(manifestPath(manifest.profileId), JSON.stringify(manifest, null, 2));
}

export function getUsedBytes(profileId: string) {
  return readManifest(profileId).totalBytes;
}

export function listFileContents(profileId: string): FileUpload[] {
  const manifest = readManifest(profileId);
  return manifest.files.map((f) => {
    const full = path.join(filesDir(profileId), f.path);
    const buf = fs.readFileSync(full);
    return {
      path: f.path,
      contentBase64: buf.toString("base64"),
    };
  });
}

export function saveFiles(
  profileId: string,
  uploads: FileUpload[],
  quotaBytes: number
): StorageManifest {
  ensureProfile(profileId);
  const manifest = readManifest(profileId);
  const fileMap = new Map(manifest.files.map((f) => [f.path, f]));
  let totalBytes = 0;
  const now = new Date().toISOString();

  for (const upload of uploads) {
    const rel = normalizePath(upload.path);
    const buf = Buffer.from(upload.contentBase64, "base64");
    totalBytes += buf.length;
    const dest = path.join(filesDir(profileId), rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    fileMap.set(rel, {
      path: rel,
      size: buf.length,
      sha256: crypto.createHash("sha256").update(buf).digest("hex"),
      updatedAt: now,
    });
  }

  const files = [...fileMap.values()];
  const newTotal = files.reduce((sum, f) => sum + f.size, 0);
  if (quotaBytes > 0 && newTotal > quotaBytes) {
    throw new Error(`Storage quota exceeded (${newTotal} > ${quotaBytes} bytes)`);
  }

  const next: StorageManifest = {
    profileId,
    version: manifest.version + 1,
    updatedAt: now,
    files,
    totalBytes: newTotal,
  };
  writeManifest(next);
  return next;
}

/** Local dev backend — swap for DO Spaces (Singapore) in production. */
export function storageBackendLabel() {
  return process.env.STORAGE_BACKEND === "spaces"
    ? "digitalocean-spaces-sgp"
    : "local-filesystem";
}
