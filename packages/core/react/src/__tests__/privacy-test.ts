import {
    type DerivePrivacySeedInput,
    getDerivePrivacySeed,
    EventEmitter,
    type PrivacySeedWalletAdapter,
    type StandardWalletAdapter,
    TSPPDeriveSeed,
    type TSPPDeriveSeedFeature,
    WalletAccountError,
    type WalletAdapterEvents,
    WalletConfigError,
    WalletDerivePrivacySeedError,
    WalletError,
    WalletNotConnectedError,
    WalletReadyState,
} from '@solana/wallet-adapter-base';
import { PublicKey } from '@solana/web3.js';

type DerivationAccount = Parameters<TSPPDeriveSeedFeature[typeof TSPPDeriveSeed]['deriveSeed']>[0]['account'];

describe('privacy seed Wallet Standard bridge', () => {
    const publicKey = new PublicKey('Foo11111111111111111111111111111111111111111');
    let adapter: StandardWalletAdapter;
    let account: DerivationAccount;
    let deriveSeed: jest.Mock;
    let signMessage: jest.Mock;
    let onError: jest.Mock;
    let feature: TSPPDeriveSeedFeature[typeof TSPPDeriveSeed];

    beforeEach(() => {
        account = {
            address: publicKey.toBase58(),
            publicKey: publicKey.toBytes(),
            chains: ['solana:devnet'],
            features: [TSPPDeriveSeed],
        };
        deriveSeed = jest.fn().mockResolvedValue({ derivationSeed: new Uint8Array(64).fill(7) });
        signMessage = jest.fn();
        feature = { version: '1.0.0', deriveSeed };
        adapter = Object.assign(new EventEmitter<WalletAdapterEvents>(), {
            standard: true as const,
            name: 'Test wallet' as StandardWalletAdapter['name'],
            url: 'https://example.com',
            icon: 'data:image/png;base64,' as const,
            publicKey,
            connecting: false,
            connected: true,
            readyState: WalletReadyState.Installed,
            supportedTransactionVersions: new Set(['legacy'] as const),
            autoConnect: jest.fn(),
            connect: jest.fn(),
            disconnect: jest.fn(),
            sendTransaction: jest.fn(),
            signMessage,
            wallet: {
                version: '1.0.0' as const,
                name: 'Test wallet',
                icon: 'data:image/png;base64,' as const,
                chains: ['solana:devnet'] as const,
                accounts: [account],
                features: {
                    'standard:connect': { version: '1.0.0' as const, connect: jest.fn() },
                    'standard:events': { version: '1.0.0' as const, on: jest.fn() },
                    'solana:signTransaction': {
                        version: '1.0.0' as const,
                        supportedTransactionVersions: ['legacy'] as const,
                        signTransaction: jest.fn(),
                    },
                    [TSPPDeriveSeed]: feature,
                },
            },
        });
        onError = jest.fn();
        adapter.on('error', onError);
    });

    it('passes the selected account to the dedicated feature without calling signMessage', async () => {
        const output = await getDerivePrivacySeed(adapter)?.({ protocol: 'tspp-v1' });
        expect(deriveSeed).toHaveBeenCalledWith({ account, protocol: 'tspp-v1' });
        expect(output).toEqual({ derivationSeed: new Uint8Array(64).fill(7) });
        expect(signMessage).not.toHaveBeenCalled();
    });

    it.each([
        ['Uint8Array', new Uint8Array(128).fill(7)],
        ['Buffer', Buffer.alloc(128, 7)],
    ])('returns a copy that does not expose the wallet buffer (%s)', async (_name, backing) => {
        deriveSeed.mockResolvedValue({ derivationSeed: backing.subarray(32, 96) });
        const output = await getDerivePrivacySeed(adapter)?.({ protocol: 'tspp-v1' });
        expect(output?.derivationSeed).toEqual(new Uint8Array(64).fill(7));
        expect(output?.derivationSeed.buffer).not.toBe(backing.buffer);
        output?.derivationSeed.fill(0);
        expect(backing.every((byte) => byte === 7)).toBe(true);
    });

    it('does not forward a caller-supplied origin or permission grant', async () => {
        const input = { protocol: 'tspp-v1' as const, origin: 'https://trusted.example', approved: true };
        await getDerivePrivacySeed(adapter)?.(input);
        expect(deriveSeed).toHaveBeenCalledWith({ account, protocol: 'tspp-v1' });
    });

    it.each([undefined, null, {}, { version: '2.0.0', deriveSeed: jest.fn() }, { version: '1.0.0' }])(
        'does not expose unsupported or malformed features (%p)',
        (unsupportedFeature) => {
            Object.assign(adapter.wallet.features, { [TSPPDeriveSeed]: unsupportedFeature });
            expect(getDerivePrivacySeed(adapter)).toBeUndefined();
            expect(signMessage).not.toHaveBeenCalled();
        }
    );

    it('does not expose derivation for an account without the feature', () => {
        Object.assign(account, { features: ['solana:signMessage'] });
        expect(getDerivePrivacySeed(adapter)).toBeUndefined();
    });

    it('does not select an account other than the connected one', () => {
        Object.assign(account, { address: PublicKey.default.toBase58(), publicKey: PublicKey.default.toBytes() });
        expect(getDerivePrivacySeed(adapter)).toBeUndefined();
    });

    it('checks connection state again when a saved callback is invoked', async () => {
        const derive = getDerivePrivacySeed(adapter);
        adapter.publicKey = null;
        adapter.connected = false;
        await expect(derive?.({ protocol: 'tspp-v1' })).rejects.toThrow(WalletNotConnectedError);
        expect(deriveSeed).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledTimes(1);
    });

    it('rejects an unknown protocol at runtime before contacting the wallet', async () => {
        await expect(
            getDerivePrivacySeed(adapter)?.({ protocol: 'unknown' } as unknown as DerivePrivacySeedInput)
        ).rejects.toThrow(WalletConfigError);
        expect(deriveSeed).not.toHaveBeenCalled();
    });

    it('rechecks account capabilities when a saved callback is invoked', async () => {
        const derive = getDerivePrivacySeed(adapter);
        Object.assign(account, { features: [] });
        await expect(derive?.({ protocol: 'tspp-v1' })).rejects.toThrow(WalletAccountError);
        expect(deriveSeed).not.toHaveBeenCalled();
    });

    it('rechecks the feature version when a saved callback is invoked', async () => {
        const derive = getDerivePrivacySeed(adapter);
        Object.assign(feature, { version: '2.0.0' });
        await expect(derive?.({ protocol: 'tspp-v1' })).rejects.toThrow(WalletConfigError);
        expect(deriveSeed).not.toHaveBeenCalled();
    });

    it.each([undefined, {}, { derivationSeed: new Uint8Array(32) }, { derivationSeed: Array(64).fill(7) }])(
        'rejects malformed wallet output (%p)',
        async (output) => {
            deriveSeed.mockResolvedValue(output);
            await expect(getDerivePrivacySeed(adapter)?.({ protocol: 'tspp-v1' })).rejects.toThrow(
                WalletDerivePrivacySeedError
            );
        }
    );

    it('discards the result if the account changes while the wallet prompts', async () => {
        deriveSeed.mockImplementation(async () => {
            adapter.publicKey = PublicKey.default;
            return { derivationSeed: new Uint8Array(64) };
        });
        await expect(getDerivePrivacySeed(adapter)?.({ protocol: 'tspp-v1' })).rejects.toThrow(WalletAccountError);
    });

    it('discards the result if the wallet disconnects while prompting', async () => {
        deriveSeed.mockImplementation(async () => {
            adapter.connected = false;
            return { derivationSeed: new Uint8Array(64) };
        });
        await expect(getDerivePrivacySeed(adapter)?.({ protocol: 'tspp-v1' })).rejects.toThrow(WalletNotConnectedError);
    });

    it('propagates denial without retrying or exposing wallet error details', async () => {
        deriveSeed.mockRejectedValue(new WalletError('secret material in error', new Uint8Array(64)));
        await expect(getDerivePrivacySeed(adapter)?.({ protocol: 'tspp-v1' })).rejects.toThrow(
            'Wallet denied or failed privacy seed derivation'
        );
        expect(deriveSeed).toHaveBeenCalledTimes(1);
        expect(signMessage).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0][0].error).toBeUndefined();
    });

    it('binds an explicitly implemented adapter method to the adapter', async () => {
        const nativeAdapter: PrivacySeedWalletAdapter = Object.assign(adapter, {
            async derivePrivacySeed() {
                expect(this).toBe(adapter);
                return { derivationSeed: new Uint8Array(64).fill(9) };
            },
        });
        await expect(getDerivePrivacySeed(nativeAdapter)?.({ protocol: 'tspp-v1' })).resolves.toEqual({
            derivationSeed: new Uint8Array(64).fill(9),
        });
        expect(deriveSeed).not.toHaveBeenCalled();
    });
});
