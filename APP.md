# Wallet Adapter for Solana Apps

This is a quick setup guide with examples of how to add Wallet Adapter to a React-based Solana app.

See the [packages](https://github.com/anza-xyz/wallet-adapter/blob/master/PACKAGES.md) and [FAQ](https://github.com/anza-xyz/wallet-adapter/blob/master/FAQ.md) for other supported frontend frameworks.

## Quick Setup (using React)

### Install

Install these dependencies:

```shell
npm install --save \
    @solana/wallet-adapter-base \
    @solana/wallet-adapter-react \
    @solana/wallet-adapter-react-ui \
    @solana/wallet-adapter-wallets \
    @solana/web3.js \
    react
```

### Setup

```tsx
import React, { FC, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { UnsafeBurnerWalletAdapter } from '@solana/wallet-adapter-wallets';
import {
    WalletModalProvider,
    WalletDisconnectButton,
    WalletMultiButton
} from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';

// Default styles that can be overridden by your app
import '@solana/wallet-adapter-react-ui/styles.css';

export const Wallet: FC = () => {
    // The network can be set to 'devnet', 'testnet', or 'mainnet-beta'.
    const network = WalletAdapterNetwork.Devnet;

    // You can also provide a custom RPC endpoint.
    const endpoint = useMemo(() => clusterApiUrl(network), [network]);

    const wallets = useMemo(
        () => [
            /**
             * Wallets that implement either of these standards will be available automatically.
             *
             *   - Solana Mobile Stack Mobile Wallet Adapter Protocol
             *     (https://github.com/solana-mobile/mobile-wallet-adapter)
             *   - Solana Wallet Standard
             *     (https://github.com/anza-xyz/wallet-standard)
             *
             * If you wish to support a wallet that supports neither of those standards,
             * instantiate its legacy wallet adapter here. Common legacy adapters can be found
             * in the npm package `@solana/wallet-adapter-wallets`.
             */
            new UnsafeBurnerWalletAdapter(),
        ],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [network]
    );

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                    <WalletMultiButton />
                    <WalletDisconnectButton />
                    { /* Your app's components go here, nested within the context providers. */ }
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
};
```

### Usage

```tsx
import { WalletNotConnectedError } from '@solana/wallet-adapter-base';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Keypair, SystemProgram, Transaction } from '@solana/web3.js';
import React, { FC, useCallback } from 'react';

export const SendSOLToRandomAddress: FC = () => {
    const { connection } = useConnection();
    const { publicKey, sendTransaction } = useWallet();

    const onClick = useCallback(async () => {
        if (!publicKey) throw new WalletNotConnectedError();

        // 890880 lamports as of 2022-09-01
        const lamports = await connection.getMinimumBalanceForRentExemption(0);

        const transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: publicKey,
                toPubkey: Keypair.generate().publicKey,
                lamports,
            })
        );

        const {
            context: { slot: minContextSlot },
            value: { blockhash, lastValidBlockHeight }
        } = await connection.getLatestBlockhashAndContext();

        const signature = await sendTransaction(transaction, connection, { minContextSlot });

        await connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature });
    }, [publicKey, sendTransaction, connection]);

    return (
        <button onClick={onClick} disabled={!publicKey}>
            Send SOL to a random address!
        </button>
    );
};
```

## Use wallet-held shielded keys

Wallets that implement the custom `tspp:shieldedKeys` feature keep the user's TSPP
viewing and nullifier keys. The app gets public keys, decrypted outputs, and
nullifiers, but never a secret key. The wallet asks the user to approve each
request.

```tsx
const { connected, getShieldedPublicKeys, decryptShielded, deriveShielded } = useWallet();

async function readPrivateOutputs() {
    if (!connected || !getShieldedPublicKeys || !decryptShielded || !deriveShielded) {
        throw new Error('Connect a wallet that supports shielded keys');
    }
    const protocol = 'tspp-v1';

    // 1. Public keys. The shielded address contains the nullifier public key.
    const { shieldedAddress, viewingPublicKeys } = await getShieldedPublicKeys({ protocol });

    // 2. Fetch encrypted outputs for the address's view tag with the Zolana SDK
    //    (`getEncryptedUtxosByTags`), and build one request per output.
    const requests = encryptedOutputs.map((output) => ({
        ciphertext: output.ciphertext,
        viewingPublicKey: viewingPublicKeys[0],
        txViewingPublicKey: output.txViewingPublicKey,
        salt: output.salt,
        slotIndex: output.slotIndex,
        label: 'transfer' as const,
    }));

    // 3. The wallet decrypts after the user approves.
    const { plaintexts } = await decryptShielded({ protocol, requests });

    // 4. Decode each plaintext with the SDK and recompute the UTXO hash from the
    //    nullifier public key. Discard outputs whose hash does not match the indexed hash.

    // 5. Derive nullifiers of the accepted UTXOs to detect spent outputs.
    const { values: nullifiers } = await deriveShielded({
        protocol,
        requests: accepted.map((utxo) => ({ kind: 'nullifier', utxoHash: utxo.hash, blinding: utxo.blinding })),
    });
}
```

The methods are `undefined` when the wallet or the connected account lacks the
feature. A user denial and a wallet failure both reject with
`WalletShieldedKeysError` from `@solana/wallet-standard-wallet-adapter-base`. A
malformed request rejects with `WalletConfigError` before the wallet sees it. A
disconnect during approval rejects with `WalletNotConnectedError`, and an account
switch with `WalletAccountError`.

Decryption output is unauthenticated: a ciphertext for someone else decrypts to
noise. Accept an output only after its recomputed hash matches the indexed hash.

`deriveShielded` accepts `nullifier`, `mergeOutputKey`, and `mergeOutputBlinding`
requests. The last two recover merge outputs. The feature does not return
per-transaction viewing keys, so sent history is not available, and it does not
sign or prove spends.

Outside React, call the same methods on a connected adapter that exposes them.
Wallet requirements are in [WALLET.md](./WALLET.md#wallet-held-shielded-keys).
