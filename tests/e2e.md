# E2E Test Checklist — Day 3 T3.4

## Eligible wallet

1. Navigate to `/`
2. Click "Connect Wallet" → MetaMask opens
3. Select eligible address (≥10 TON staked on mainnet)
4. Sign SIWE message
5. Verify redirect to `/dashboard`
6. Confirm "Total Staked" shows correct amount, badge shows "✓ Eligible"
7. Click "Issue API Key"
8. Confirm key displayed once with Copy button
9. Save key, dismiss
10. Reload page → key not shown again (only `hasActiveKey: true`)
11. Run curl test:
    ```bash
    curl https://api2.ai.tokamak.network/v1/chat/completions \
      -H "Authorization: Bearer <KEY>" \
      -H "Content-Type: application/json" \
      -d '{"model":"qwen-3.6","messages":[{"role":"user","content":"ping"}]}'
    ```
    Expect: 200 with non-empty `choices[0].message.content`

## Ineligible wallet

1. Navigate to `/`
2. Connect wallet with < 10 TON staked
3. Sign SIWE message
4. Verify redirect to `/dashboard`
5. Confirm "✗ Not eligible" badge and staking link shown
6. Confirm "Issue API Key" button is NOT visible
