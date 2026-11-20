---
'@solana/wallet-adapter-base': minor
'@solana/wallet-adapter-react': minor
---

Add `useWallet().getShieldedPublicKeys`, `decryptShielded`, and `deriveShielded` for adapters that hold TSPP
shielded keys. Standard wallets get the methods from the custom `tspp:shieldedKeys` feature in the helius-labs
fork of `wallet-standard`. The wallet keeps the viewing and nullifier keys and returns only public keys, raw
plaintexts, and derived values.
