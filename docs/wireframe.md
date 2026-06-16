# Wireframes — §7 HANDOFF.md (verbatim)

## Landing `/`

```
+--------------------------------------------+
|  Tokamak LLM Access                        |
|  Stake >= 100 TON -> Get your API key      |
|                                            |
|  [ Connect Wallet ]                        |
|                                            |
|  How it works:                             |
|  1) Connect EVM wallet                     |
|  2) Sign message (no gas)                  |
|  3) Receive API key for qwen-3.6           |
+--------------------------------------------+
```

## Dashboard `/dashboard` — eligible

```
+--------------------------------------------+
|  0xabcd...1234       [ Disconnect ]        |
|                                            |
|  Total Staked: 42.7 TON  [OK] Eligible     |
|                                            |
|  +-- Your API Key ----------------------+  |
|  | (no active key)                      |  |
|  | [ Issue API Key ]                    |  |
|  +--------------------------------------+  |
|                                            |
|  Endpoint: https://api2.ai.tokamak.network |
|  Model:    qwen-3.6                        |
+--------------------------------------------+
```

## Dashboard — after issue (1-time key display)

```
+--------------------------------------------+
|  !! Save this key now. It won't be shown   |
|     again.                                 |
|  sk-litellm-xxxxxxxxxxxxxxxx  [ Copy ]     |
|                                            |
|  Example:                                  |
|  curl https://api2.ai.tokamak.network/...  |
|       -H "Authorization: Bearer sk-..."    |
+--------------------------------------------+
```

## Dashboard — ineligible

```
+--------------------------------------------+
|  0xabcd...1234                             |
|  Total Staked: 3.2 TON  [X] Not eligible   |
|  Stake at least 100 TON to receive a key.  |
|  -> tokamak.network/staking                |
+--------------------------------------------+
```
