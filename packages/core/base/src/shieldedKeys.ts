import type { WalletAdapter, WalletAdapterProps } from './adapter.js';

/** Key derivation and cipher protocol. */
export type ShieldedKeysProtocol = 'tspp-v1';

export interface GetShieldedPublicKeysInput {
    readonly protocol: ShieldedKeysProtocol;
}

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
    readonly protocol: ShieldedKeysProtocol;
    readonly requests: readonly ShieldedDecryptRequest[];
}

export interface DecryptShieldedOutput {
    /**
     * Raw cipher output, one per request in request order. Unauthenticated: verify
     * the decoded commitment before accepting an output.
     */
    readonly plaintexts: readonly Uint8Array[];
}

/** Values derived from the nullifier key for spent detection and merge recovery. */
export type ShieldedDeriveRequest =
    | { readonly kind: 'nullifier'; readonly utxoHash: Uint8Array; readonly blinding: Uint8Array }
    | { readonly kind: 'mergeOutputKey'; readonly firstNullifier: Uint8Array }
    | { readonly kind: 'mergeOutputBlinding'; readonly firstNullifier: Uint8Array };

export interface DeriveShieldedInput {
    readonly protocol: ShieldedKeysProtocol;
    readonly requests: readonly ShieldedDeriveRequest[];
}

export interface DeriveShieldedOutput {
    /** 32-byte values, one per request in request order. */
    readonly values: readonly Uint8Array[];
}

/** The wallet holds the TSPP viewing and nullifier keys. No method returns a secret key. */
export interface ShieldedKeysWalletAdapterProps<Name extends string = string> extends WalletAdapterProps<Name> {
    getShieldedPublicKeys(input: GetShieldedPublicKeysInput): Promise<GetShieldedPublicKeysOutput>;
    /** The wallet asks the user to approve each batch. */
    decryptShielded(input: DecryptShieldedInput): Promise<DecryptShieldedOutput>;
    /** The wallet asks the user to approve each batch. */
    deriveShielded(input: DeriveShieldedInput): Promise<DeriveShieldedOutput>;
}

export type ShieldedKeysWalletAdapter<Name extends string = string> = WalletAdapter<Name> &
    ShieldedKeysWalletAdapterProps<Name>;
