/**
 * Public entrypoint for @rootware/session.
 *
 * TODO: Implement session stores, token boundaries, authentication, and expiry.
 */

export type SessionId = string;
export type PrincipalId = string;
export type SessionData = Record<string, unknown>;

export interface Principal {
  readonly id: PrincipalId;
  readonly claims?: Record<string, unknown>;
}

export interface Session {
  readonly id: SessionId;
  readonly principal: Principal;
  readonly data: SessionData;
  readonly createdAt: Date;
  readonly expiresAt?: Date;
}

export interface SessionCreateOptions {
  readonly ttlMs?: number;
  readonly data?: SessionData;
}

export interface SessionStore {
  create(
    principal: Principal,
    options?: SessionCreateOptions,
  ): Promise<Session>;
  get(id: SessionId): Promise<Session | null>;
  touch(id: SessionId, ttlMs?: number): Promise<Session>;
  destroy(id: SessionId): Promise<boolean>;
}

export interface AuthCredential {
  readonly type: string;
  readonly value: unknown;
}

export interface AuthResult {
  readonly principal: Principal;
  readonly session?: Session;
}

export interface Authenticator {
  authenticate(credential: AuthCredential): Promise<AuthResult>;
}

export class RootwareSessionManager implements SessionStore {
  create(
    _principal: Principal,
    _options?: SessionCreateOptions,
  ): Promise<Session> {
    throw new Error("Not implemented");
  }

  get(_id: SessionId): Promise<Session | null> {
    throw new Error("Not implemented");
  }

  touch(_id: SessionId, _ttlMs?: number): Promise<Session> {
    throw new Error("Not implemented");
  }

  destroy(_id: SessionId): Promise<boolean> {
    throw new Error("Not implemented");
  }

  authenticate(_credential: AuthCredential): Promise<AuthResult> {
    throw new Error("Not implemented");
  }
}

export function createSessionManager(): RootwareSessionManager {
  throw new Error("Not implemented");
}
