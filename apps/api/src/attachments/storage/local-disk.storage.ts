import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import { Injectable } from '@nestjs/common';

import { env } from '../../config/env';

import { InvalidStorageKeyError, StorageObjectNotFoundError, type StorageProvider } from './storage.provider';

/**
 * `StorageProvider` implementation backed by the local filesystem.
 *
 * DEV CAVEAT (spec §10 "Provider independence & dev caveat"): this
 * provider is DEVELOPMENT-ONLY. It is NOT durable (no replication, no
 * backups beyond whatever the host disk provides) and NOT multi-instance
 * safe (two API processes writing/reading the same key must share a
 * filesystem, which a horizontally-scaled deployment cannot assume). It
 * exists so M2 can ship attachments without provisioning cloud infra.
 *
 * A persistent, multi-instance-safe object-storage provider (e.g. S3 or
 * S3-compatible storage) is intended as a later drop-in behind the same
 * `StorageProvider` interface — swapping providers requires no change to
 * any caller (the attachment service / upload / download endpoints built
 * in Tasks 15/16), only a DI binding change for `STORAGE_PROVIDER`. No
 * cloud infra is introduced in M2.
 */
@Injectable()
export class LocalDiskStorageProvider implements StorageProvider {
  /** Absolute, resolved storage root. All keys are resolved against this. */
  private readonly root: string;

  constructor(root: string = env.ATTACHMENT_STORAGE_DIR) {
    this.root = path.resolve(root);
  }

  async put(key: string, buf: Buffer): Promise<void> {
    const resolved = this.resolveKey(key);
    // Keys are flat `<cuid>.<ext>` in practice (Task 15 generates them),
    // so it suffices to ensure the root itself exists rather than
    // mkdir-ing per-key parent directories.
    await mkdir(this.root, { recursive: true });
    await writeFile(resolved, buf);
  }

  async get(key: string): Promise<Buffer> {
    const resolved = this.resolveKey(key);
    try {
      return await readFile(resolved);
    } catch (err) {
      if (isErrnoException(err) && err.code === 'ENOENT') {
        throw new StorageObjectNotFoundError(key);
      }
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const resolved = this.resolveKey(key);
    try {
      await unlink(resolved);
    } catch (err) {
      // Deleting a key that was never written (or already deleted) is a
      // no-op, not an error: callers (e.g. a Task 15 compensating delete
      // after a failed DB write) should not have to special-case "it
      // never landed on disk" vs. "it was already removed".
      if (isErrnoException(err) && err.code === 'ENOENT') {
        return;
      }
      throw err;
    }
  }

  /**
   * Resolves `key` against the storage root and asserts the resolved
   * absolute path stays within the root. This is the path-traversal
   * guard: `key` is untrusted (caller-supplied / derived from a client
   * filename in later tasks), so it must never be allowed to resolve to
   * `../../etc/passwd`, an absolute path, or a sibling directory that
   * merely shares the root's path as a string prefix (e.g.
   * `<root>-evil/...` — hence the explicit `+ path.sep` check below
   * rather than a bare `startsWith(root)`).
   */
  private resolveKey(key: string): string {
    if (!key) {
      throw new InvalidStorageKeyError(key);
    }

    const resolved = path.resolve(this.root, key);

    const withinRoot = resolved === this.root || resolved.startsWith(this.root + path.sep);
    if (!withinRoot) {
      throw new InvalidStorageKeyError(key);
    }

    return resolved;
  }
}

/**
 * Narrow type guard for Node's `ErrnoException` shape. Used instead of
 * `any`/`as` casts to safely read `.code` off a caught `unknown` error.
 */
function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}
