# Wallet Adapter for Solana Wallets

Support for [Mobile Wallet Adapter](https://github.com/solana-mobile/mobile-wallet-adapter) (MWA) and the [Wallet Standard](https://github.com/wallet-standard/wallet-standard) has been added directly into Wallet Adapter.  Please review the MWA docs and [this guide for wallets](https://github.com/solana-labs/wallet-standard/blob/master/WALLET.md) to implement the Wallet Standard.

You can implement these protocols directly in your wallet, and your wallet will work across Solana apps. As wallets continue to add support for these protocols, the adapters for these wallets will be deprecated.

For any wallet injected into the window in a browser, browser extension, or mobile app, you no longer need to publish an adapter at all. You don't need to open a PR to MWA or the Wallet Standard.

We are no longer accepting contributions for new adapters of this type. Bug fixes to existing adapters are welcome, but new features should be implemented using the MWA and Wallet Standard interfaces.

Contributions are still welcome for new adapters that are not injected into the window but instead rely on loading an SDK to interact with an external wallet.

## Privacy seed derivation

`tspp:deriveSeed` is a custom Wallet Standard feature. Its types and the
`TSPPDeriveSeed` constant are exported from `@solana/wallet-standard-features`.

```ts
type TSPPDeriveSeedFeature = {
    'tspp:deriveSeed': {
        version: '1.0.0';
        deriveSeed(input: {
            account: WalletAccount;
            protocol: 'tspp-v1';
        }): Promise<{ derivationSeed: Uint8Array }>;
    };
};
```

Advertise the feature on `wallet.features` and on each supporting account's
`features`. The adapter passes the connected account and the protocol to
`deriveSeed`, and rejects the result if the wallet disconnects or switches account
during approval.

### Wallet permissions

The wallet must:

1. Take the requesting origin from its extension or transport, not from the
   request payload.
2. Reject accounts that are not authorized for the connection, and protocols other
   than `tspp-v1`.
3. Before signing, show the origin and account and state that access reveals
   private balances and transaction history. Connection approval does not cover
   this.
4. Store remembered grants in the wallet, keyed by exact origin (scheme, host, and
   port), account public key, and protocol.
5. Let the user revoke a grant in wallet settings.

Approved websites receive the same seed for an account. Revocation does not affect
seeds already returned.

### Signing bytes

For `tspp-v1`, sign these bytes
([Helius derivation specification](https://www.helius.dev/docs/privacy/integration/wallet)):

| Field | Bytes |
| --- | --- |
| Signing domain | `0xff` followed by ASCII `solana offchain` (16 bytes) |
| Message version | `0x00` |
| Application domain | SHA-256 of UTF-8 `"TSPP/derive/v1"` (32 bytes) |
| Message format | `0x00` (restricted ASCII) |
| Signer count | `0x01` |
| Signer | Account's Ed25519 public key (32 bytes) |
| Payload length | `0x0e 0x00` (14, little-endian u16) |
| Payload | UTF-8 `"TSPP/derive/v1"` (14 bytes) |

Test vector for a signer public key of 32 zero bytes, one field per line:

```
ff736f6c616e61206f6666636861696e
00
1d32a88533af12d35e5ac6fce817a4cb810bcc4115386b14a78e8b2ef09d864c
00
01
0000000000000000000000000000000000000000000000000000000000000000
0e00
545350502f6465726976652f7631
```

Return the 64-byte Ed25519 signature as `derivationSeed`. Reject `signMessage`
requests for these bytes, and keep the seed out of errors and logs.

An account whose signer does not produce the deterministic RFC 8032 Ed25519
signature, such as a threshold or MPC signer, must not advertise the feature.

SDK-based adapters can implement `derivePrivacySeed` from
`PrivacySeedWalletAdapterProps` instead, with the same checks.
