/**
 * wagmi v2 config — mainnet only (MetaMask + injected wallets)
 *
 * Sepolia support is intentionally excluded from the production config;
 * staking balances are read from Ethereum mainnet SeigManagerV1_3.
 * For local testing add `sepolia` to the chains array.
 */
import { createConfig, http } from "wagmi";
import { mainnet } from "wagmi/chains";
import { injected, metaMask } from "wagmi/connectors";

export const wagmiConfig = createConfig({
  chains: [mainnet],
  connectors: [
    metaMask(),
    injected(), // WalletConnect / Coinbase / etc. via browser injected provider
  ],
  transports: {
    [mainnet.id]: http(), // uses the public RPC; replace with process.env.NEXT_PUBLIC_RPC_URL if needed
  },
  ssr: true, // Next.js App Router requires SSR-safe hydration
});
