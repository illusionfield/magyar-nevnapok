import crypto from "node:crypto";
import path from "node:path";

function createTokenNotFoundError(token) {
  const error = new Error(`Érvénytelen vagy lejárt letöltési token: ${token}`);
  error.statusCode = 404;
  error.code = "download_token_not_found";
  return error;
}

export class DownloadTokenStore {
  constructor({ ttlMs = 10 * 60 * 1000 } = {}) {
    this.ttlMs = ttlMs;
    this.tokens = new Map();
  }

  purgeExpired() {
    const now = Date.now();

    for (const [token, entry] of this.tokens.entries()) {
      if (entry.expiresAt <= now) {
        this.tokens.delete(token);
      }
    }
  }

  issue(filePath, options = {}) {
    const token = crypto.randomUUID();
    const expiresAt = Date.now() + this.ttlMs;
    const fileName = options.fileName ?? path.basename(filePath);

    this.tokens.set(token, {
      filePath,
      fileName,
      issuedAt: new Date().toISOString(),
      expiresAt,
    });

    return {
      token,
      url: `/letoltes/${token}`,
      fileName,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  resolve(token) {
    this.purgeExpired();
    const entry = this.tokens.get(token) ?? null;

    if (!entry) {
      throw createTokenNotFoundError(token);
    }

    this.tokens.delete(token);
    return entry;
  }
}
