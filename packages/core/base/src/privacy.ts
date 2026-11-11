import type { WalletAccount } from '@wallet-standard/base';
import type { WalletAdapter, WalletAdapterProps } from './adapter.js';
import {
    WalletAccountError,
    WalletConfigError,
    WalletDerivePrivacySeedError,
    WalletError,
    WalletNotConnectedError,
} from './errors.js';
import type { StandardWalletAdapter } from './standard.js';
import type { Adapter } from './types.js';

/** Custom Wallet Standard feature; this is not an official Solana feature. */
export const TSPPDeriveSeed = 'tspp:deriveSeed';

export interface DerivePrivacySeedInput {
    readonly protocol: 'tspp-v1';
}

export interface DerivePrivacySeedOutput {
    /** Secret 64-byte signature over the protocol's exact off-chain message v0 bytes. */
    readonly derivationSeed: Uint8Array;
}

export interface PrivacySeedWalletAdapterProps<Name extends string = string> extends WalletAdapterProps<Name> {
    /** The wallet must authorize the requesting origin before releasing the seed. */
    derivePrivacySeed(input: DerivePrivacySeedInput): Promise<DerivePrivacySeedOutput>;
}

export type PrivacySeedWalletAdapter<Name extends string = string> = WalletAdapter<Name> &
    PrivacySeedWalletAdapterProps<Name>;

export type TSPPDeriveSeedFeature = {
    readonly [TSPPDeriveSeed]: {
        readonly version: '1.0.0';
        /** Construct the message and enforce origin permissions inside the wallet. */
        readonly deriveSeed: (
            input: DerivePrivacySeedInput & { readonly account: WalletAccount }
        ) => Promise<DerivePrivacySeedOutput>;
    };
};

function getFeature(adapter: StandardWalletAdapter): TSPPDeriveSeedFeature[typeof TSPPDeriveSeed] | undefined {
    if (!(TSPPDeriveSeed in adapter.wallet.features)) return undefined;
    const feature = adapter.wallet.features[TSPPDeriveSeed];
    if (
        feature &&
        typeof feature === 'object' &&
        'version' in feature &&
        feature.version === '1.0.0' &&
        'deriveSeed' in feature &&
        typeof feature.deriveSeed === 'function'
    ) {
        return feature as TSPPDeriveSeedFeature[typeof TSPPDeriveSeed];
    }
    return undefined;
}

/** Resolve an optional adapter method or bridge a custom Wallet Standard feature. */
export function getDerivePrivacySeed(adapter: Adapter): PrivacySeedWalletAdapterProps['derivePrivacySeed'] | undefined {
    if ('derivePrivacySeed' in adapter && typeof adapter.derivePrivacySeed === 'function') {
        return adapter.derivePrivacySeed.bind(adapter);
    }
    if (!('standard' in adapter) || !adapter.standard || !getFeature(adapter)) return undefined;
    if (
        adapter.connected &&
        !adapter.wallet.accounts.some(
            (account) => account.address === adapter.publicKey?.toBase58() && account.features.includes(TSPPDeriveSeed)
        )
    ) {
        return undefined;
    }

    return async (input) => {
        try {
            const publicKey = adapter.publicKey;
            if (!adapter.connected || !publicKey) throw new WalletNotConnectedError();
            if (input?.protocol !== 'tspp-v1') throw new WalletConfigError('Unsupported privacy derivation protocol');

            const feature = getFeature(adapter);
            if (!feature) throw new WalletConfigError('Wallet does not support tspp:deriveSeed version 1.0.0');
            const account = adapter.wallet.accounts.find((account) => account.address === publicKey.toBase58());
            if (!account || !account.features.includes(TSPPDeriveSeed)) {
                throw new WalletAccountError('Account does not support privacy seed derivation');
            }

            let output: DerivePrivacySeedOutput;
            try {
                output = await feature.deriveSeed({ account, protocol: input.protocol });
            } catch {
                throw new WalletDerivePrivacySeedError('Wallet denied or failed privacy seed derivation');
            }
            if (!adapter.connected || !adapter.publicKey) throw new WalletNotConnectedError();
            if (!adapter.publicKey.equals(publicKey)) {
                throw new WalletAccountError('Wallet account changed during privacy seed derivation');
            }
            if (!(output?.derivationSeed instanceof Uint8Array) || output.derivationSeed.length !== 64) {
                throw new WalletDerivePrivacySeedError('Wallet returned an invalid privacy derivation seed');
            }
            // Copy so the caller cannot reach the wallet's underlying buffer. `slice()` on a
            // Node `Buffer` returns a view on the same memory, so construct a new array.
            return { derivationSeed: new Uint8Array(output.derivationSeed) };
        } catch (cause) {
            // Wallet errors can contain secret key material; do not copy their message or cause.
            const error =
                cause instanceof WalletError
                    ? cause
                    : new WalletDerivePrivacySeedError('Privacy seed derivation failed');
            adapter.emit('error', error);
            throw error;
        }
    };
}
