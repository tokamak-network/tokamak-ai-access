/**
 * wagmi v2 config — chain selected via NEXT_PUBLIC_CHAIN env var
 *
 * Connectors:
 *   - Rabby Wallet: explicit target (Rabby does not support EIP-6963)
 *   - MetaMask, OKX, and other wallets: auto-discovered via EIP-6963
 *
 * Excluded intentionally:
 *   - metaMask() SDK connector: injects DOM overlays that block pointer events
 *     on sibling wallet buttons in the modal.
 *   - injected() generic: when OKX overrides window.ethereum it would connect
 *     to OKX silently instead of the user's intended wallet.
 *   - injected({ target: window.okxwallet }): OKX extension injects a DOM
 *     overlay that blocks pointer events on this button; EIP-6963 handles OKX.
 *
 * Transport: uses NEXT_PUBLIC_RPC_URL when set, falling back to reliable
 * public endpoints. http() alone without a URL uses cloudflare-eth.com which
 * can be rate-limited, causing useReadContract to silently return undefined.
 */
import { createConfig, http, fallback } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

const isSepolia = process.env.NEXT_PUBLIC_CHAIN === "sepolia";
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;

const connectors = [
  // Rabby does not announce via EIP-6963 — target it explicitly.
  // window.rabby is Rabby's own namespace (works even when OKX overrides
  // window.ethereum). Falls back to the providers array or isRabby flag.
  injected({
    target() {
      if (typeof window === "undefined") return undefined;
      const win = window as Window & {
        rabby?: object;
        ethereum?: {
          isRabby?: boolean;
          providers?: Array<{ isRabby?: boolean }>;
        };
      };
      const rabby =
        win.rabby ??
        win.ethereum?.providers?.find((p: { isRabby?: boolean }) => p.isRabby) ??
        (win.ethereum?.isRabby ? win.ethereum : undefined);
      if (!rabby) return undefined;
      return {
        id: "rabby",
        name: "Rabby Wallet",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        provider: rabby as any,
      };
    },
  }),
  // MetaMask, OKX, Coinbase Wallet, and all other EIP-6963 wallets are
  // auto-discovered at runtime via multiInjectedProviderDiscovery (default).
];

export const wagmiConfig = isSepolia
  ? createConfig({
      chains: [sepolia],
      connectors,
      transports: {
        [sepolia.id]: rpcUrl
          ? fallback([http(rpcUrl), http()])
          : http(),
      },
      ssr: true,
    })
  : createConfig({
      chains: [mainnet],
      connectors,
      transports: {
        [mainnet.id]: rpcUrl
          ? fallback([http(rpcUrl), http("https://eth.llamarpc.com"), http()])
          : fallback([http("https://eth.llamarpc.com"), http("https://rpc.ankr.com/eth"), http()]),
      },
      ssr: true,
    });
