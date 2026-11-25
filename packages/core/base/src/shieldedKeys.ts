import type { WalletAdapter, WalletAdapterProps } from './adapter.js';

/** Key derivation and cipher this feature implements. A later protocol can be added as an optional field. */
export type ShieldedKeysProtocol = 'tspp-v1';

/** Protocol recorded on view grants. Callers do not pass it. */
export const SHIELDED_KEYS_PROTOCOL: ShieldedKeysProtocol = 'tspp-v1';

export interface GetShieldedPublicKeysOutput {
    /** 99-byte shielded address: signing identity, nullifier public key, and tagged viewing public key. */
    readonly shieldedAddress: Uint8Array;
    /** 33-byte tagged X25519 viewing public keys held by the wallet, current first. */
    readonly viewingPublicKeys: readonly Uint8Array[];
}

/** Cipher label of a ciphertext. */
export type ShieldedDecryptLabel = 'transfer' | 'ringDeposit';

export interface ShieldedDecryptRequest {
    readonly ciphertext: Uint8Array;
    /** 33-byte tagged viewing public key of the held key to decrypt with. */
    readonly viewingPublicKey: Uint8Array;
    /** 33-byte tagged transaction viewing public key. */
    readonly txViewingPublicKey: Uint8Array;
    /** 16-byte transaction salt. */
    readonly salt: Uint8Array;
    /** Output slot index, a u32. Zero for a ring deposit. */
    readonly slotIndex: number;
    readonly label: ShieldedDecryptLabel;
}

export interface DecryptShieldedInput {
    readonly requests: readonly ShieldedDecryptRequest[];
}

/** Byte length of the account nullifier secret returned by `decryptShielded`. */
export const SHIELDED_NULLIFIER_SECRET_LENGTH = 31;

export interface DecryptShieldedOutput {
    /**
     * Raw cipher output, one per request in request order. Unauthenticated: verify
     * the decoded commitment before accepting an output.
     */
    readonly plaintexts: readonly Uint8Array[];
    /**
     * The account's 31-byte nullifier secret. The app uses it with the SDK to compute
     * nullifiers and merge outputs. A fresh copy on every successful response.
     */
    readonly nullifierSecret: Uint8Array;
}

/** Longest view grant a wallet may issue. The wallet clamps longer requests. */
export const SHIELDED_VIEW_GRANT_MAX_SECONDS = 30 * 60;

export interface GrantShieldedViewInput {
    /**
     * Requested lifetime in seconds. The wallet clamps this to
     * `1..SHIELDED_VIEW_GRANT_MAX_SECONDS` and sets the expiry from its own clock.
     */
    readonly durationSeconds: number;
}

export interface GrantShieldedViewOutput {
    /** Unix milliseconds on the wallet clock when the grant expires. */
    readonly expiresAt: number;
}

/**
 * Shielded calls on `useWallet()`. Present only when the connected account supports
 * the whole feature. `decrypt` skips the prompt while a view grant for this origin
 * and account is unexpired.
 */
export interface Shielded {
    getPublicKeys(): Promise<GetShieldedPublicKeysOutput>;
    decrypt(input: DecryptShieldedInput): Promise<DecryptShieldedOutput>;
    /**
     * Approve decrypt for this origin and account until `expiresAt`.
     * A live grant is returned unchanged and is not extended.
     */
    grantView(input: GrantShieldedViewInput): Promise<GrantShieldedViewOutput>;
}

/**
 * The wallet holds the TSPP viewing key. `decryptShielded` returns plaintexts and the
 * nullifier secret. It skips the user prompt while a view grant for this origin and
 * account is unexpired.
 */
export interface ShieldedKeysWalletAdapterProps<Name extends string = string> extends WalletAdapterProps<Name> {
    getShieldedPublicKeys(): Promise<GetShieldedPublicKeysOutput>;
    /** The wallet asks the user to approve each batch, unless a live view grant covers it. */
    decryptShielded(input: DecryptShieldedInput): Promise<DecryptShieldedOutput>;
    /**
     * Approve decrypt for this origin and account until `expiresAt`.
     * A live grant is returned unchanged and is not extended.
     */
    grantShieldedView(input: GrantShieldedViewInput): Promise<GrantShieldedViewOutput>;
}

export type ShieldedKeysWalletAdapter<Name extends string = string> = WalletAdapter<Name> &
    ShieldedKeysWalletAdapterProps<Name>;
