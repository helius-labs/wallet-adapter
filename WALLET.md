# Wallet Adapter for Solana Wallets

Support for [Mobile Wallet Adapter](https://github.com/solana-mobile/mobile-wallet-adapter) (MWA) and the [Wallet Standard](https://github.com/wallet-standard/wallet-standard) has been added directly into Wallet Adapter.  Please review the MWA docs and [this guide for wallets](https://github.com/solana-labs/wallet-standard/blob/master/WALLET.md) to implement the Wallet Standard.

You can implement these protocols directly in your wallet, and your wallet will work across Solana apps. As wallets continue to add support for these protocols, the adapters for these wallets will be deprecated.

For any wallet injected into the window in a browser, browser extension, or mobile app, you no longer need to publish an adapter at all. You don't need to open a PR to MWA or the Wallet Standard.

We are no longer accepting contributions for new adapters of this type. Bug fixes to existing adapters are welcome, but new features should be implemented using the MWA and Wallet Standard interfaces.

Contributions are still welcome for new adapters that are not injected into the window but instead rely on loading an SDK to interact with an external wallet.

## Privacy seed derivation

`tspp:deriveSeed` is a custom Wallet Standard feature for this fork, not an official
Solana feature. Exported types and the `TSPPDeriveSeed` constant are available from
`@solana/wallet-adapter-base`:

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

Advertise the feature on both `wallet.features` and each supported account's
`features`. The bridge selects the account matching the adapter's connected public
key, validates feature version `1.0.0`, and forwards only the account and protocol.
It rechecks capabilities on each call and rejects results if the wallet disconnects
or changes account while approval is pending. It does not cache seeds or implement
permissions in app storage.

### Wallet permissions

The wallet implementation must:

1. Obtain the requesting origin from its trusted extension or wallet transport.
   Never trust an origin supplied in a page's request payload. Reject opaque
   origins and use HTTPS origins in production. Frame-based transports must bind
   the requesting frame and top-level origin so an embedded page cannot inherit
   another website's grant.
2. Check that the account belongs to this wallet and is authorized for the
   connection. Reject unknown protocols, arbitrary messages, and unsupported
   signing accounts.
3. Before releasing a seed, show the exact origin and account and explain that
   access reveals private balances and transaction history. Offer approval for
   this request or a remembered permission. Ordinary connection approval is not
   approval to derive privacy keys.
4. Store remembered grants inside the wallet, keyed by exact origin (scheme,
   hostname, and port), account public key, and `tspp-v1`. Do not use wildcard
   domains. Enforce the permission at the trusted signer boundary, not only in
   the injected provider.
5. Provide a wallet settings control to revoke a website's grant. Recheck the
   connection, selected account, and grant before returning a result. Denial must
   reject without signing or releasing a cached seed.

Every approved website receives the same protocol seed. Revocation does not remove
previously exported seeds. If exporting the seed is unsuitable, keep privacy keys
inside the wallet and expose the required privacy operations instead.

### Exact signing bytes

For `tspp-v1`, construct the following bytes inside the wallet, according to the
[Helius derivation specification](https://www.helius.dev/docs/privacy/integration/wallet):

| Field | Bytes |
| --- | --- |
| Signing domain | `0xff` followed by ASCII `" solana offchain"` (16 bytes total) |
| Message version | `0x00` |
| Application domain | SHA-256 of UTF-8 `"TSPP/derive/v1"` (32 bytes) |
| Message format | `0x00` (restricted ASCII) |
| Signer count | `0x01` |
| Signer | Selected account's Ed25519 public key (32 bytes) |
| Payload length | `0x0e 0x00` (14, unsigned little-endian 16-bit) |
| Payload | UTF-8 `"TSPP/derive/v1"` (14 bytes) |

Return the deterministic 64-byte Ed25519 signature as `derivationSeed`. Signing the
bare payload, adding the website origin or a nonce, or using another envelope
produces a different seed. Accounts whose signer cannot produce this exact
deterministic signature must not advertise the feature.

Continue rejecting generic message-signing requests for the reserved derivation
message, including its encoded form. The dedicated API is the only path that can
release this signature after checking privacy permissions. Do not include the seed
in errors or logs. The standard bridge replaces wallet rejection details with a
generic `WalletDerivePrivacySeedError` before emitting the adapter's error event.

SDK-based adapters can instead implement `PrivacySeedWalletAdapterProps` directly.
Their `derivePrivacySeed` method has the same protocol and output, and must enforce
the same wallet-side permission, signing, connection, and account checks and emit
sanitized errors. `getDerivePrivacySeed(adapter)` resolves either this method or
the Wallet Standard feature.


