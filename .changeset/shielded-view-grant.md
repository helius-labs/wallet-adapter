---
'@solana/wallet-adapter-base': minor
'@solana/wallet-adapter-react': minor
---

Add `useWallet().grantShieldedView` so a dapp can decrypt and derive shielded outputs for up to 30 minutes after one approval. `ShieldedViewGrantStore` records the origin, account, and expiry and does not hold key material.
