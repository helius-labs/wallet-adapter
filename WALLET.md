# Wallet Adapter for Solana Wallets

Support for [Mobile Wallet Adapter](https://github.com/solana-mobile/mobile-wallet-adapter) (MWA) and the [Wallet Standard](https://github.com/wallet-standard/wallet-standard) has been added directly into Wallet Adapter. Please review the MWA docs and [this guide for wallets](https://github.com/solana-labs/wallet-standard/blob/master/WALLET.md) to implement the Wallet Standard.

You can implement these protocols directly in your wallet, and your wallet will work across Solana apps. As wallets continue to add support for these protocols, the adapters for these wallets will be deprecated.

For any wallet injected into the window in a browser, browser extension, or mobile app, you no longer need to publish an adapter at all. You don't need to open a PR to MWA or the Wallet Standard.

We are no longer accepting contributions for new adapters of this type. Bug fixes to existing adapters are welcome, but new features should be implemented using the MWA and Wallet Standard interfaces.

Contributions are still welcome for new adapters that are not injected into the window but instead rely on loading an SDK to interact with an external wallet.

## Wallet-held shielded keys

`tspp:shieldedKeys` is a custom Wallet Standard feature. Its types and the
`TSPPShieldedKeys` constant are exported from `@solana/wallet-standard-features`.
The wallet keeps the account's TSPP viewing key and answers read requests with it.
`decrypt` also returns the 31-byte nullifier secret so the app can run the SDK's
nullifier and merge functions. `grantView` records a short permission to answer
`decrypt` without another prompt. The grant holds no key material.

```ts
type TSPPShieldedKeysFeature = {
    'tspp:shieldedKeys': {
        version: '1.0.0';
        getPublicKeys(input: {
            account: WalletAccount;
        }): Promise<{ shieldedAddress: Uint8Array; viewingPublicKeys: readonly Uint8Array[] }>;
        decrypt(input: {
            account: WalletAccount;
            requests: readonly {
                ciphertext: Uint8Array;
                viewingPublicKey: Uint8Array; // 33 bytes
                txViewingPublicKey: Uint8Array; // 33 bytes
                salt: Uint8Array; // 16 bytes
                slotIndex: number; // u32, 0 for ringDeposit
                label: 'transfer' | 'ringDeposit';
            }[];
        }): Promise<{ plaintexts: readonly Uint8Array[]; nullifierSecret: Uint8Array }>; // 31 bytes
        grantView(input: {
            account: WalletAccount;
            durationSeconds: number; // wallet clamps to 1..1800
        }): Promise<{ expiresAt: number }>; // unix milliseconds, wallet clock
    };
};
```

Advertise the feature on `wallet.features` and on each supporting account's
`features`. The adapter passes the connected account, validates request widths
before calling the wallet, and validates and copies the output. It rejects the
result if the wallet disconnects or switches account during approval.

### Outputs

- `getPublicKeys`: the 99-byte shielded address and the 33-byte tagged viewing
  public keys the wallet holds, current first. A tagged key is `0x04` followed by
  the little-endian X25519 u coordinate. The first key must equal the last 33
  bytes of the address.
- `decrypt`: one raw plaintext per request, in request order, each as long as its
  ciphertext, plus the account's 31-byte nullifier secret. Decrypt with the held key
  that matches `viewingPublicKey`. Return the cipher output even if it is noise: the
  app checks ownership by recomputing the UTXO hash. Return a fresh copy of the secret
  on every successful response, including an empty batch.
- `grantView`: `{ expiresAt }` on the wallet clock. `getPublicKeys` does not require a grant.

A malformed request rejects the whole batch.

### Wallet rules

The wallet must:

1. Take the requesting origin from its extension or transport, not from the
   request payload.
2. Reject accounts that are not authorized for the connection. This feature is
   `tspp-v1`. Callers do not send a protocol. A later protocol can be added as an
   optional field that defaults to `tspp-v1`.
3. Ask the user to approve each `decrypt` batch, unless a live view grant covers
   this origin and account. Show the origin, account, and request count,
   and state that approval reveals private balances, history, and the nullifier
   secret. Connection approval does not cover this.
4. Store a view grant as the only new state. It records the origin, account,
   `SHIELDED_KEYS_PROTOCOL` (`tspp-v1`), and `expiresAt`, and no key material.
   `ShieldedViewGrantStore` in
   `@solana/wallet-adapter-base` is the reference behavior:
    - Clamp `durationSeconds` to `1..1800`. Set `expiresAt` from the wallet clock.
      Ignore a dapp-supplied expiry.
    - The approval dialog names the origin, the account, and the concrete end
      time, and states that this does not by itself sign a spend.
    - If a grant for this origin and account is already live, return it and do not
      prompt. Do not extend it. A longer request waits until it expires.
    - Clear it on lock, disconnect, account switch, and as soon as `expiresAt` is
      reached. Keep it in the unlocked session only.
    - The grant covers `decrypt` only. It does not cover `signMessage` or `signIn`.
5. Never return the derivation seed, the viewing secret, or a per-transaction
   viewing key. `decrypt` does return the nullifier secret. Keep the other secrets
   out of errors and logs.
6. Reject `signMessage` and `signIn` requests whose signed bytes equal the
   derivation message below. Otherwise a site could obtain the seed by signing it.

An account whose signer does not produce the deterministic RFC 8032 Ed25519
signature, such as a threshold or MPC signer, must not advertise the feature.

### Keys

Sign the derivation message with the account's Ed25519 key. The 64-byte signature
is the seed. Build the keys from it with the Zolana SDK's
`LocalShieldedKeys.fromDerivationSeed`, which implements `decrypt` for these
requests. Prefer it to a separate implementation; the summary below is
for checking one against the test vector. The app uses the returned nullifier
secret with the SDK for nullifiers and merge outputs.

Derivation message bytes
([Helius derivation specification](https://www.helius.dev/docs/privacy/integration/wallet)):

| Field              | Bytes                                                 |
| ------------------ | ----------------------------------------------------- |
| Signing domain     | `0xff` followed by ASCII `solana offchain` (16 bytes) |
| Message version    | `0x00`                                                |
| Application domain | SHA-256 of UTF-8 `"TSPP/derive/v1"` (32 bytes)        |
| Message format     | `0x00` (restricted ASCII)                             |
| Signer count       | `0x01`                                                |
| Signer             | Account's Ed25519 public key (32 bytes)               |
| Payload length     | `0x0e 0x00` (14, little-endian u16)                   |
| Payload            | UTF-8 `"TSPP/derive/v1"` (14 bytes)                   |

From the seed, `prk = HKDF-Extract(SHA-256, no salt, seed)`. The viewing secret is
`HKDF-Expand(prk, "TSPP/view_key/ed25519/x25519/v1", 32)` with X25519 clamping, and
the nullifier secret is `HKDF-Expand(prk, "TSPP/nf_key/ed25519/v1", 31)`.

### Decryption

For a request:

```text
dh    = X25519(viewingSecret, txViewingPublicKey u coordinate)
ikm   = dh || txViewingPublicKey || viewingPublicKey      (33-byte tagged keys)
info  = "TSPP/hpke/" || label || salt || u32be(slotIndex)  (label "TSPP/tx" or "TSPP/ring_deposit")
okm   = HKDF-SHA256(ikm, no salt, info, 44)
plain = AES-256-CTR(key = okm[0..32], counter block = okm[32..44] || u32be(2), ciphertext)
```

Reject malformed public keys and an all-zero `dh`. Test vector (`hpke_utxo` in the
Zolana repository's `test-vectors/key_derivation.json`), label `transfer`:

| Field                      | Value                                            |
| -------------------------- | ------------------------------------------------ |
| Recipient viewing secret   | `00..02` (32 bytes)                              |
| Transaction viewing secret | `00..01` (32 bytes)                              |
| Salt                       | 16 zero bytes                                    |
| Slot index                 | `0`                                              |
| Ciphertext                 | `ea82df97f14bd244e83b4fabfd`                     |
| Plaintext                  | `64657465726d696e6973746963` (`"deterministic"`) |

SDK-based adapters can implement `getShieldedPublicKeys`, `decryptShielded`, and
`grantShieldedView` from `ShieldedKeysWalletAdapterProps` instead. They must follow
the same rules and also do what the Wallet Standard adapter does for them: validate
request widths before prompting, return fresh byte arrays, check that the nullifier
secret is 31 bytes, check that the first viewing key matches the one in the shielded
address, and reject with an error that carries no wallet details. Use
`ShieldedViewGrantStore` for the grant record. The pinned
`@solana/wallet-standard-wallet-adapter-base` does not forward `grantView` or the
nullifier secret yet, so those parts of `useWallet()` stay absent for a Wallet
Standard wallet until that package grows them.
