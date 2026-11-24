import { randomUUID } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { copyFile, mkdir, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { describeError } from '../../utils/errors.ts';
import { UUID } from '../../utils/ids.ts';
import type { Logger } from '../../utils/logger.ts';

/** Where note images are kept. The database holds only the key (`attachments.storage_key`). */
export interface ObjectStorage {
  readonly driver: 'local' | 'gcs';
  /** Stores a new object; never overwrites an existing one. */
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  /** The object's bytes, or null when it does not exist. */
  open(key: string): Promise<Readable | null>;
  /** Copies an object to a new key (never overwrites); false when the source does not exist. */
  copy(fromKey: string, toKey: string): Promise<boolean>;
  /** Deletes objects; missing ones are ignored. */
  remove(keys: readonly string[]): Promise<void>;
}

/**
 * The only keys the backend makes: notes/<note id>/<random uuid>. Anything else is refused (no path tricks). Note ids
 * were numbers before the UUID migration (20261123090000); keys stored then keep their numeric folder.
 */
const KEY = new RegExp(`^notes/([0-9]{1,18}|${UUID})/${UUID}$`);

export const newStorageKey = (noteId: string): string => `notes/${noteId}/${randomUUID()}`;

function checked(key: string): string {
  if (!KEY.test(key)) throw new Error('invalid storage key');
  return key;
}

const isMissing = (err: unknown) => (err as { code?: unknown }).code === 'ENOENT';

/** Development: files in a folder on this machine (`LOCAL_STORAGE_DIR`, gitignored). */
export function createLocalStorage(dir: string): ObjectStorage {
  const root = path.resolve(dir);
  const fileOf = (key: string) => path.join(root, ...checked(key).split('/'));

  return {
    driver: 'local',

    async put(key, data) {
      const file = fileOf(key);
      await mkdir(path.dirname(file), { recursive: true });
      // 'wx': fails if the file exists; 0o600: readable by the backend's user only.
      await writeFile(file, data, { flag: 'wx', mode: 0o600 });
    },

    async open(key) {
      const file = fileOf(key);
      try {
        if (!(await stat(file)).isFile()) return null;
      } catch (err) {
        if (isMissing(err)) return null;
        throw err;
      }
      return createReadStream(file);
    },

    async copy(fromKey, toKey) {
      const source = fileOf(fromKey);
      const target = fileOf(toKey);
      await mkdir(path.dirname(target), { recursive: true });
      try {
        // COPYFILE_EXCL: fails if the target exists. The copy keeps the source's 0o600.
        await copyFile(source, target, constants.COPYFILE_EXCL);
      } catch (err) {
        if (isMissing(err)) {
          await rmdir(path.dirname(target)).catch(() => undefined); // the folder made above, when still empty
          return false;
        }
        throw err;
      }
      return true;
    },

    async remove(keys) {
      const files = keys.map(fileOf);
      await Promise.all(files.map((file) => rm(file, { force: true })));
      // Then the note folders, when nothing is left in them.
      const folders = new Set(files.map((file) => path.dirname(file)));
      await Promise.all([...folders].map((folder) => rmdir(folder).catch(() => undefined)));
    },
  };
}

/**
 * Staging and production: a private Google Cloud Storage bucket. Credentials come from Application Default
 * Credentials (the platform's workload identity), never from configuration. Images are streamed through the backend,
 * which checks access on every read, so the bucket never needs public or signed URLs.
 */
export async function createGcsStorage(bucketName: string): Promise<ObjectStorage> {
  // Loaded only when this driver is used, so local development never needs Google Cloud libraries at start-up.
  const { Storage } = await import('@google-cloud/storage');
  const bucket = new Storage().bucket(bucketName);

  return {
    driver: 'gcs',

    async put(key, data, contentType) {
      await bucket.file(checked(key)).save(data, {
        contentType,
        resumable: false,
        // ifGenerationMatch 0: only if no object has this key yet (never overwrite).
        preconditionOpts: { ifGenerationMatch: 0 },
      });
    },

    async open(key) {
      const file = bucket.file(checked(key));
      const [exists] = await file.exists();
      return exists ? file.createReadStream() : null;
    },

    async copy(fromKey, toKey) {
      const source = bucket.file(checked(fromKey));
      const [exists] = await source.exists();
      if (!exists) return false;
      // Copied inside the bucket (the bytes never pass through the backend); ifGenerationMatch 0: never overwrite.
      await source.copy(bucket.file(checked(toKey)), { preconditionOpts: { ifGenerationMatch: 0 } });
      return true;
    },

    async remove(keys) {
      await Promise.all(keys.map((key) => bucket.file(checked(key)).delete({ ignoreNotFound: true })));
    },
  };
}

export interface StorageConfig {
  STORAGE_DRIVER: 'local' | 'gcs';
  LOCAL_STORAGE_DIR: string;
  GCS_BUCKET?: string | undefined;
}

export async function createObjectStorage(config: StorageConfig): Promise<ObjectStorage> {
  if (config.STORAGE_DRIVER === 'gcs') {
    if (!config.GCS_BUCKET) throw new Error('GCS_BUCKET is required when STORAGE_DRIVER=gcs');
    return createGcsStorage(config.GCS_BUCKET);
  }
  return createLocalStorage(config.LOCAL_STORAGE_DIR);
}

/**
 * Deletes image files after their rows are gone (committed). Best effort: a failure leaves an orphan file that no
 * row points to (unreachable through the API) and is logged with a count only.
 */
export async function removeFiles(storage: ObjectStorage, logger: Logger, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await storage.remove(keys);
  } catch (err) {
    logger.warn({ count: keys.length, driver: storage.driver, err: describeError(err) }, 'attachment: files not deleted');
  }
}
