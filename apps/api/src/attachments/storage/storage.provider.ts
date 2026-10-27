/**
 * Provider-independent storage abstraction for attachment bytes.
 *
 * This interface is the seam between "where an attachment's bytes live"
 * and the rest of the attachments domain (DB metadata, upload/download
 * endpoints — see Tasks 15/16). A caller holding a `StorageProvider`
 * never needs to know whether the bytes are on local disk, in S3, or
 * anywhere else — swapping providers requires no caller-side change.
 *
 * `key` is an opaque, caller-chosen identifier for a stored object (in
 * practice a `<cuid>.<ext>`-shaped string — see Task 15). Implementations
 * MUST treat `key` as untrusted input and defend against path traversal,
 * absolute-path injection, and similar escapes (see
 * `LocalDiskStorageProvider` for the local-disk case).
 */
export interface StorageProvider {
  /** Writes `buf` under `key`, creating/overwriting as needed. */
  put(key: string, buf: Buffer): Promise<void>;
  /** Reads the bytes stored under `key`. Throws `StorageObjectNotFoundError` if absent. */
  get(key: string): Promise<Buffer>;
  /** Removes the object stored under `key`. Implementations document their own missing-key behavior. */
  delete(key: string): Promise<void>;
}

/**
 * DI injection token for the active `StorageProvider` implementation.
 * Consumers (Task 15/16 attachment services) `@Inject(STORAGE_PROVIDER)`
 * rather than depending on a concrete class, so swapping the local-disk
 * provider for a future object-storage provider is a module-wiring change
 * only.
 */
export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

/**
 * Thrown by `StorageProvider.get` (and `put`/`delete`, where applicable)
 * when the given key fails storage-key validation — e.g. it attempts path
 * traversal (`../`), is an absolute path, or is otherwise unsafe to resolve
 * against the storage root. Message intentionally matches `/invalid key/i`.
 */
export class InvalidStorageKeyError extends Error {
  constructor(key: string) {
    super(`Invalid key: storage key resolves outside the storage root (${key})`);
    this.name = 'InvalidStorageKeyError';
  }
}

/**
 * Thrown by `StorageProvider.get` when no object exists under the given
 * key. Typed (rather than a raw `ENOENT`/generic `Error`) so callers —
 * notably the Task 15/16 download endpoint — can catch this specific case
 * and map it to a clean 404 instead of leaking filesystem errors.
 */
export class StorageObjectNotFoundError extends Error {
  constructor(key: string) {
    super(`Storage object not found for key: ${key}`);
    this.name = 'StorageObjectNotFoundError';
  }
}
