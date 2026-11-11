---
'@solana/wallet-adapter-base': minor
'@solana/wallet-adapter-react': minor
---

Add `useWallet().derivePrivacySeed` for adapters that have a `derivePrivacySeed`
method. Standard wallets get the method from the custom `tspp:deriveSeed` feature
in the helius-labs fork of `wallet-standard`.
