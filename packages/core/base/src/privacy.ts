import type { WalletAdapter, WalletAdapterProps } from './adapter.js';

export interface DerivePrivacySeedInput {
    readonly protocol: 'tspp-v1';
}

export interface DerivePrivacySeedOutput {
    /** 64-byte Ed25519 signature over the protocol's derivation message. Secret. */
    readonly derivationSeed: Uint8Array;
}

export interface PrivacySeedWalletAdapterProps<Name extends string = string> extends WalletAdapterProps<Name> {
    /** The wallet must authorize the requesting origin before releasing the seed. */
    derivePrivacySeed(input: DerivePrivacySeedInput): Promise<DerivePrivacySeedOutput>;
}

export type PrivacySeedWalletAdapter<Name extends string = string> = WalletAdapter<Name> &
    PrivacySeedWalletAdapterProps<Name>;
