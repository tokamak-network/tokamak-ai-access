"use client";

/**
 * Client-side provider tree
 *
 * Wraps the entire app with:
 *  - WagmiProvider   → wallet state, hooks (useAccount, useConnect, …)
 *  - QueryClientProvider → wagmi v2 uses TanStack Query internally
 *
 * Keep this file as a thin shell — no business logic here.
 */
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/wagmi";
import { ReactNode, useState } from "react";

export default function Providers({ children }: { children: ReactNode }) {
  // Create QueryClient inside component to avoid sharing state across requests
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
