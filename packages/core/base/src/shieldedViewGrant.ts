import { WalletConfigError } from './errors.js';
import { SHIELDED_VIEW_GRANT_MAX_SECONDS, type ShieldedKeysProtocol } from './shieldedKeys.js';

/** Permission for one origin to decrypt for one account until `expiresAt`. Holds no key material. */
export interface ShieldedViewGrant {
    /** Origin taken from the wallet transport. */
    readonly origin: string;
    /** Connected account address. */
    readonly account: string;
    readonly protocol: ShieldedKeysProtocol;
    /** Unix milliseconds on the wallet clock. */
    readonly expiresAt: number;
}

export interface ShieldedViewGrantRequest {
    readonly origin: string;
    readonly account: string;
    readonly protocol: ShieldedKeysProtocol;
    /** Requested lifetime. Clamped to `1..SHIELDED_VIEW_GRANT_MAX_SECONDS` when a new grant is stored. */
    readonly durationSeconds: number;
    /** Wallet clock, unix milliseconds. */
    readonly now: number;
}

/**
 * Session record of view grants. The wallet prompts, then calls {@link ShieldedViewGrantStore.grant}.
 * A later decrypt calls {@link ShieldedViewGrantStore.get} and skips the prompt on a hit.
 * Call {@link ShieldedViewGrantStore.revokeAccount} on lock, disconnect, and account switch.
 */
export class ShieldedViewGrantStore {
    private grants = new Map<string, ShieldedViewGrant>();

    /** Live grant for this origin, account, and protocol, or `null` when missing or expired. */
    get(origin: string, account: string, protocol: ShieldedKeysProtocol, now: number): ShieldedViewGrant | null {
        const key = grantKey(origin, account, protocol);
        const grant = this.grants.get(key);
        if (!grant) return null;
        if (grant.expiresAt <= now) {
            this.grants.delete(key);
            return null;
        }
        return grant;
    }

    /**
     * Return the live grant, or store a new one. Does not extend a live grant.
     * Call this only after the user approves, or when {@link ShieldedViewGrantStore.get} already returned a grant.
     */
    grant(request: ShieldedViewGrantRequest): ShieldedViewGrant {
        const existing = this.get(request.origin, request.account, request.protocol, request.now);
        if (existing) return existing;
        assertIdentity(request.origin, request.account, request.now);
        const seconds = clampDuration(request.durationSeconds);
        const grant: ShieldedViewGrant = {
            origin: request.origin,
            account: request.account,
            protocol: request.protocol,
            expiresAt: request.now + seconds * 1000,
        };
        this.grants.set(grantKey(request.origin, request.account, request.protocol), grant);
        return grant;
    }

    revoke(origin: string, account: string, protocol: ShieldedKeysProtocol): void {
        this.grants.delete(grantKey(origin, account, protocol));
    }

    /** Drop every grant for an account, across origins. */
    revokeAccount(account: string): void {
        for (const [key, grant] of this.grants) {
            if (grant.account === account) this.grants.delete(key);
        }
    }

    clear(): void {
        this.grants.clear();
    }
}

function grantKey(origin: string, account: string, protocol: ShieldedKeysProtocol): string {
    return JSON.stringify([protocol, origin, account]);
}

function assertIdentity(origin: string, account: string, now: number): void {
    if (origin === '' || account === '') {
        throw new WalletConfigError('Shielded view grant requires an origin and an account');
    }
    if (!Number.isFinite(now)) {
        throw new WalletConfigError('Shielded view grant requires a finite wallet clock');
    }
}

function clampDuration(durationSeconds: number): number {
    if (!Number.isFinite(durationSeconds) || durationSeconds < 1) {
        throw new WalletConfigError('Shielded view grant duration must be at least 1 second');
    }
    return Math.min(Math.floor(durationSeconds), SHIELDED_VIEW_GRANT_MAX_SECONDS);
}
