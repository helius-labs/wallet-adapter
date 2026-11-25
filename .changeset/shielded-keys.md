---
'@solana/wallet-adapter-base': minor
'@solana/wallet-adapter-react': minor
---

Add `useWallet().getShieldedPublicKeys`, `decryptShielded`, and `grantShieldedView` for adapters that hold TSPP
shielded keys. `decryptShielded` returns raw plaintexts and the 31-byte nullifier secret. A view grant lets a dapp
decrypt for up to 30 minutes after one approval. The wallet keeps the viewing key and the derivation seed.
