/**
 * wagmi v2 config — mainnet only
 *
 * Connectors:
 *   1. MetaMask      — explicit metaMask() connector
 *   2. OKX Wallet    — injected({ target }) targeting window.okxwallet
 *   3. Browser Wallet — generic injected() fallback for any other EVM wallet
 *
 * Sepolia support is intentionally excluded from the production config;
 * staking balances are read from Ethereum mainnet SeigManagerV1_3.
 */
import { createConfig, http } from "wagmi";
import { mainnet } from "wagmi/chains";
import { injected, metaMask } from "wagmi/connectors";

export const wagmiConfig = createConfig({
  chains: [mainnet],
  connectors: [
    metaMask(),
    injected({
      target() {
        if (typeof window === "undefined") return undefined;
        const okx = (window as Window & { okxwallet?: object }).okxwallet;
        if (!okx) return undefined;
        return {
          id: "okxwallet",
          name: "OKX Wallet",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          provider: okx as any,
        };
      },
    }),
    injected(), // generic browser wallet fallback
  ],
  transports: {
    [mainnet.id]: http(),
  },
  ssr: true,
});
