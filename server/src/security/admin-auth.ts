import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';

function getConfiguredAdminKey(): string {
  return (process.env.ADMIN_KEY || process.env.COCKPIT_ADMIN_KEY || '').trim();
}

function extractProvidedKey(req: Request): string {
  const headerKey = req.header('X-Admin-Key');
  if (headerKey?.trim()) {
    return headerKey.trim();
  }

  const authHeader = req.header('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }

  return '';
}

function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function isAdminConfigured(): boolean {
  return getConfiguredAdminKey().length > 0;
}

export function isAdminRequest(req: Request): boolean {
  const configuredKey = getConfiguredAdminKey();
  const providedKey = extractProvidedKey(req);
  return Boolean(configuredKey && providedKey && safeCompare(configuredKey, providedKey));
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const configuredKey = getConfiguredAdminKey();
  if (!configuredKey) {
    res.status(503).json({
      error: '管理员能力未启用，请先在服务端配置 ADMIN_KEY',
      code: 'ADMIN_NOT_CONFIGURED',
      status: 503,
    });
    return;
  }

  const providedKey = extractProvidedKey(req);
  if (!providedKey || !safeCompare(configuredKey, providedKey)) {
    res.status(403).json({
      error: '管理员认证失败',
      code: 'ADMIN_FORBIDDEN',
      status: 403,
    });
    return;
  }

  next();
}

export function resolveRequestActor(req: Request): string {
  const actor = req.header('X-Admin-Actor')?.trim();
  if (actor) {
    return actor;
  }
  return req.ip || 'unknown';
}
