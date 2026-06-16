/**
 * wagmi v2 config — mainnet only
 *
 * Connectors:
 *   1. MetaMask   — explicit metaMask() connector
 *   2. OKX Wallet — injected({ target }) targeting window.okxwallet
 *
 * Transport: uses NEXT_PUBLIC_RPC_URL when set, falling back to reliable
 * public endpoints. http() alone without a URL uses cloudflare-eth.com which
 * can be rate-limited, causing useReadContract to silently return undefined.
 *
 * Sepolia support is intentionally excluded from the production config;
 * staking balances are read from Ethereum mainnet SeigManagerV1_3.
 */
import { createConfig, http, fallback } from "wagmi";
import { mainnet } from "wagmi/chains";
import { injected, metaMask } from "wagmi/connectors";

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;

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
          icon: "/okx-icon.svg",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          provider: okx as any,
        };
      },
    }),
  ],
  transports: {
    [mainnet.id]: rpcUrl
      ? fallback([http(rpcUrl), http("https://eth.llamarpc.com"), http()])
      : fallback([http("https://eth.llamarpc.com"), http("https://rpc.ankr.com/eth"), http()]),
  },
  ssr: true,
});
