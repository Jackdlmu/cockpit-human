import fs from 'fs';
import path from 'path';

export interface JsonFileStoreOptions<T> {
  filePath: string;
  defaultValue: T;
  label: string;
  maxBackups?: number;
  validate?: (data: unknown) => boolean;
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
  const maxBackups = options.maxBackups ?? 5;
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

  function getTimestampBackups(): string[] {
    const dir = path.dirname(options.filePath);
    const base = path.basename(options.filePath);
    try {
      return fs.readdirSync(dir)
        .filter((f) => f.startsWith(`${base}.bak.`) && f.length > `${base}.bak.`.length + 10)
        .map((f) => path.join(dir, f))
        .sort((a, b) => fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime());
    } catch {
      return [];
    }
  }

  function rotateTimestampBackups(): void {
    const backups = getTimestampBackups();
    while (backups.length >= maxBackups) {
      const old = backups.pop();
      if (old) {
        try { fs.unlinkSync(old); } catch { /* ignore */ }
      }
    }
  }

  function createTimestampBackup(): void {
    if (!fs.existsSync(options.filePath)) return;
    const dir = path.dirname(options.filePath);
    const base = path.basename(options.filePath);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(dir, `${base}.bak.${ts}`);
    try {
      fs.copyFileSync(options.filePath, backupFile);
      rotateTimestampBackups();
    } catch {
      // 备份失败不阻塞主流程
    }
  }

  function isValid(data: T | null): data is T {
    if (data === null) return false;
    if (options.validate) {
      try {
        return options.validate(data);
      } catch {
        return false;
      }
    }
    return true;
  }

  function read(): T {
    if (cache !== null) {
      return cache;
    }

    ensureStoreFile();

    // 1. 尝试主文件
    const mainData = tryRead(options.filePath);
    if (mainData !== null && isValid(mainData)) {
      cache = mainData;
      return cache;
    }

    // 2. 尝试时间戳备份（最新的优先）
    const timestampBackups = getTimestampBackups();
    for (const backupFile of timestampBackups) {
      const backupData = tryRead(backupFile);
      if (backupData !== null && isValid(backupData)) {
        cache = backupData;
        try {
          fs.copyFileSync(backupFile, options.filePath);
          console.log(`[${options.label}] Recovered from timestamp backup: ${path.basename(backupFile)}`);
        } catch (err) {
          console.error(`[${options.label}] Failed to restore primary store from timestamp backup:`, err);
        }
        return cache;
      }
    }

    // 3. 尝试经典备份
    if (fs.existsSync(backupPath)) {
      const backupData = tryRead(backupPath);
      if (backupData !== null && isValid(backupData)) {
        cache = backupData;
        try {
          fs.copyFileSync(backupPath, options.filePath);
          console.log(`[${options.label}] Recovered from legacy backup`);
        } catch (err) {
          console.error(`[${options.label}] Failed to restore primary store from backup:`, err);
        }
        return cache;
      }
    }

    console.error(`[${options.label}] Primary and all backups are invalid, falling back to default value`);
    cache = cloneJson(options.defaultValue);
    return cache;
  }

  function write(data: T): void {
    const payload = cloneJson(data);
    cache = payload;

    writeQueue = writeQueue.then(() => {
      ensureStoreFile();
      const tmpPath = `${options.filePath}.tmp`;

      // 备份当前文件
      if (fs.existsSync(options.filePath)) {
        try {
          fs.copyFileSync(options.filePath, backupPath);
        } catch (err) {
          console.error(`[${options.label}] Failed to create legacy backup:`, err);
        }
        createTimestampBackup();
      }

      fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf-8');

      // 校验：确保临时文件可正确解析且数据有效
      try {
        const verify = JSON.parse(fs.readFileSync(tmpPath, 'utf-8'));
        if (!isValid(verify)) {
          throw new Error('写入校验失败：临时文件数据验证未通过');
        }
      } catch (verifyErr) {
        throw new Error(`写入校验失败: ${verifyErr instanceof Error ? verifyErr.message : String(verifyErr)}`);
      }

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
