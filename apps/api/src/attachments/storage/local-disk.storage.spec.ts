import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { LocalDiskStorageProvider } from './local-disk.storage';
import { StorageObjectNotFoundError } from './storage.provider';

describe('LocalDiskStorageProvider', () => {
  let root: string;
  let store: LocalDiskStorageProvider;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'pg-attachments-test-'));
    store = new LocalDiskStorageProvider(root);
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('round-trips the exact bytes through put then get', async () => {
    const key = 'round-trip.bin';
    const buf = randomBytes(256);

    await store.put(key, buf);
    const read = await store.get(key);

    expect(Buffer.compare(read, buf)).toBe(0);
  });

  it('rejects path traversal in a storage key', async () => {
    await expect(store.put('../escape.jpg', Buffer.from('x'))).rejects.toThrow(/invalid key/i);
  });

  it('rejects an absolute-path key', async () => {
    await expect(store.put('/etc/passwd', Buffer.from('x'))).rejects.toThrow(/invalid key/i);
  });

  it('rejects a nested traversal key that climbs above the root', async () => {
    await expect(store.put('a/../../escape', Buffer.from('x'))).rejects.toThrow(/invalid key/i);
  });

  it('rejects an empty key', async () => {
    await expect(store.put('', Buffer.from('x'))).rejects.toThrow(/invalid key/i);
  });

  it('rejects a key that resolves into a sibling dir sharing the root as a string prefix', async () => {
    // Guards against the classic prefix-escape false positive: a bare
    // `resolved.startsWith(root)` would incorrectly ACCEPT a key like
    // `../<rootBaseName>-evil/x` because the string "<root>-evil" starts
    // with the string "<root>". The containment check must require the
    // path separator after the root, not just a string prefix match.
    const siblingKey = `../${root.split('/').pop()}-evil/x`;
    await expect(store.put(siblingKey, Buffer.from('x'))).rejects.toThrow(/invalid key/i);
  });

  it('throws a typed not-found error when getting a missing key', async () => {
    await expect(store.get('does-not-exist.bin')).rejects.toBeInstanceOf(
      StorageObjectNotFoundError,
    );
  });

  it('also rejects traversal keys on get and delete', async () => {
    await expect(store.get('../escape.jpg')).rejects.toThrow(/invalid key/i);
    await expect(store.delete('../escape.jpg')).rejects.toThrow(/invalid key/i);
  });

  it('delete removes an existing key, after which get throws not-found', async () => {
    const key = 'to-delete.bin';
    await store.put(key, Buffer.from('bye'));

    await store.delete(key);

    await expect(store.get(key)).rejects.toBeInstanceOf(StorageObjectNotFoundError);
  });

  it('delete of a missing key is a no-op (idempotent delete)', async () => {
    await expect(store.delete('never-existed.bin')).resolves.toBeUndefined();
  });

  afterEach(async () => {
    // Individual tests write files directly under `root`; no per-test
    // cleanup needed since keys are unique per test and the whole root is
    // removed in `afterAll`.
  });
});
