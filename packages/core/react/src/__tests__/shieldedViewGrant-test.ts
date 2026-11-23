import {
    SHIELDED_VIEW_GRANT_MAX_SECONDS,
    ShieldedViewGrantStore,
    WalletConfigError,
} from '@solana/wallet-adapter-base';

const origin = 'https://app.example';
const account = 'Account11111111111111111111111111111111111111';
const protocol = 'tspp-v1' as const;
const now = 1_700_000_000_000;

describe('ShieldedViewGrantStore', () => {
    let store: ShieldedViewGrantStore;

    beforeEach(() => {
        store = new ShieldedViewGrantStore();
    });

    it('clamps a longer request to 30 minutes', () => {
        const grant = store.grant({ origin, account, protocol, durationSeconds: 60 * 60, now });
        expect(grant.expiresAt).toBe(now + SHIELDED_VIEW_GRANT_MAX_SECONDS * 1000);
    });

    it('returns a live grant unchanged', () => {
        const first = store.grant({ origin, account, protocol, durationSeconds: 60, now });
        const again = store.grant({ origin, account, protocol, durationSeconds: 30 * 60, now: now + 1_000 });
        expect(again).toBe(first);
        expect(again.expiresAt).toBe(now + 60 * 1000);
    });

    it('treats a different origin as a different grant', () => {
        store.grant({ origin, account, protocol, durationSeconds: 60, now });
        expect(store.get('https://other.example', account, protocol, now)).toBeNull();
    });

    it('drops the grant at expiresAt', () => {
        const grant = store.grant({ origin, account, protocol, durationSeconds: 60, now });
        expect(store.get(origin, account, protocol, grant.expiresAt - 1)).toBe(grant);
        expect(store.get(origin, account, protocol, grant.expiresAt)).toBeNull();
    });

    it('revokes every origin for an account', () => {
        const other = 'Other111111111111111111111111111111111111111';
        store.grant({ origin, account, protocol, durationSeconds: 60, now });
        store.grant({ origin: 'https://other.example', account, protocol, durationSeconds: 60, now });
        store.grant({ origin, account: other, protocol, durationSeconds: 60, now });
        store.revokeAccount(account);
        expect(store.get(origin, account, protocol, now)).toBeNull();
        expect(store.get('https://other.example', account, protocol, now)).toBeNull();
        expect(store.get(origin, other, protocol, now)).not.toBeNull();
    });

    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects duration %s', (durationSeconds) => {
        expect(() => store.grant({ origin, account, protocol, durationSeconds, now })).toThrow(WalletConfigError);
    });

    it('rejects an empty origin', () => {
        expect(() => store.grant({ origin: '', account, protocol, durationSeconds: 60, now })).toThrow(
            WalletConfigError
        );
    });
});
