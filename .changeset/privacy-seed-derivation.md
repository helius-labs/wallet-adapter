---
'@solana/wallet-adapter-base': minor
'@solana/wallet-adapter-react': minor
---

Add optional privacy seed derivation through the custom `tspp:deriveSeed` wallet
feature and `useWallet().derivePrivacySeed`. Supporting wallets must authorize the
requesting website before returning the TSPP derivation signature.
