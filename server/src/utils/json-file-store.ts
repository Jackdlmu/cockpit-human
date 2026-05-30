import fs from 'fs';
import path from 'path';

export interface JsonFileStoreOptions<T> {
  filePath: string;
  defaultValue: T;
  label: string;
}

export interface JsonFileStore<T> {
  readonly filePath: string;
  readonly backupPath: string;
  read(): T;
  write(data: T): void;
  update(updater: (current: T) => T): T;
  resetCache(): void;
  waitForWrites(): Promise<void>;
}

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createJsonFileStore<T>(options: JsonFileStoreOptions<T>): JsonFileStore<T> {
  const backupPath = `${options.filePath}.bak`;
  let cache: T | null = null;
  let writeQueue: Promise<void> = Promise.resolve();

  function ensureStoreFile(): void {
    const dir = path.dirname(options.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(options.filePath)) {
      fs.writeFileSync(
        options.filePath,
        JSON.stringify(cloneJson(options.defaultValue), null, 2),
        'utf-8'
      );
    }
  }

  function tryRead(filePath: string): T | null {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
    } catch {
      return null;
    }
  }

  function read(): T {
    if (cache !== null) {
      return cache;
    }

    ensureStoreFile();

    const mainData = tryRead(options.filePath);
    if (mainData !== null) {
      cache = mainData;
      return cache;
    }

    if (fs.existsSync(backupPath)) {
      const backupData = tryRead(backupPath);
      if (backupData !== null) {
        cache = backupData;
        try {
          fs.copyFileSync(backupPath, options.filePath);
        } catch (err) {
          console.error(`[${options.label}] Failed to restore primary store from backup:`, err);
        }
        return cache;
      }
    }

    console.error(`[${options.label}] Primary and backup store are invalid, falling back to default value`);
    cache = cloneJson(options.defaultValue);
    return cache;
  }

  function write(data: T): void {
    const payload = cloneJson(data);
    cache = payload;

    writeQueue = writeQueue.then(() => {
      ensureStoreFile();
      const tmpPath = `${options.filePath}.tmp`;

      if (fs.existsSync(options.filePath)) {
        try {
          fs.copyFileSync(options.filePath, backupPath);
        } catch (err) {
          console.error(`[${options.label}] Failed to create backup:`, err);
        }
      }

      fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf-8');
      fs.renameSync(tmpPath, options.filePath);
    }).catch((err) => {
      console.error(`[${options.label}] Write failed:`, err);
    });
  }

  function update(updater: (current: T) => T): T {
    const nextValue = updater(cloneJson(read()));
    write(nextValue);
    return nextValue;
  }

  return {
    filePath: options.filePath,
    backupPath,
    read,
    write,
    update,
    resetCache() {
      cache = null;
      writeQueue = Promise.resolve();
    },
    waitForWrites() {
      return writeQueue;
    },
  };
}
