// tests/e2e/wallet-mock.ts

/**
 * Builds a self-contained IIFE script string to inject as window.ethereum.
 * Injected via page.addInitScript() before page load — no imports allowed.
 *
 * Handles:
 *   - EIP-1193 provider (eth_requestAccounts, personal_sign, eth_sendTransaction, ...)
 *   - EIP-6963 provider announcement (wagmi v2 metaMask connector uses this)
 */
export function buildWalletMockScript(address: string): string {
  return `
(function() {
  var MOCK_ADDRESS = '${address}';
  var MOCK_CHAIN_ID = '0x1'; // mainnet (app wagmi config is mainnet-only)

  var listeners = {};

  var provider = {
    isMetaMask: true,
    selectedAddress: MOCK_ADDRESS,
    chainId: MOCK_CHAIN_ID,

    on: function(event, listener) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(listener);
      return this;
    },

    removeListener: function(event, listener) {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(function(l) { return l !== listener; });
      }
      return this;
    },

    emit: function(event) {
      var args = Array.prototype.slice.call(arguments, 1);
      (listeners[event] || []).forEach(function(l) { l.apply(null, args); });
    },

    request: function(args) {
      var method = args.method;
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') {
        return Promise.resolve([MOCK_ADDRESS]);
      }
      if (method === 'eth_chainId') {
        return Promise.resolve(MOCK_CHAIN_ID);
      }
      if (method === 'net_version') {
        return Promise.resolve('1');
      }
      if (method === 'personal_sign' || method === 'eth_sign') {
        // Return a fake 65-byte signature (valid format, content doesn't matter since verify is mocked)
        return Promise.resolve('0x' + 'ab'.repeat(65));
      }
      if (method === 'eth_sendTransaction') {
        return Promise.resolve('0x' + 'cd'.repeat(32));
      }
      if (method === 'wallet_switchEthereumChain') {
        return Promise.resolve(null);
      }
      if (method === 'eth_getBlockByNumber') {
        return Promise.resolve({ baseFeePerGas: '0x3b9aca00', number: '0x1234567' });
      }
      if (method === 'eth_estimateGas') {
        return Promise.resolve('0x5208');
      }
      if (method === 'eth_gasPrice') {
        return Promise.resolve('0x3b9aca00');
      }
      if (method === 'eth_getTransactionCount') {
        return Promise.resolve('0x0');
      }
      if (method === 'eth_getTransactionReceipt') {
        return Promise.resolve({
          status: '0x1',
          blockNumber: '0x1234568',
          transactionHash: '0x' + 'cd'.repeat(32),
          logs: [],
        });
      }
      return Promise.reject(new Error('[wallet-mock] Method not implemented: ' + method));
    },

    // Legacy interface (wagmi may call these directly)
    enable: function() {
      return Promise.resolve([MOCK_ADDRESS]);
    },

    sendAsync: function(payload, callback) {
      this.request(payload)
        .then(function(result) { callback(null, { id: payload.id, jsonrpc: '2.0', result: result }); })
        .catch(function(err) { callback(err, null); });
    },
  };

  window.ethereum = provider;

  // EIP-6963: wagmi metaMask() connector listens for 'eip6963:requestProvider'
  // and expects an 'eip6963:announceProvider' response.
  function announceProvider() {
    var event = new CustomEvent('eip6963:announceProvider', {
      detail: Object.freeze({
        info: {
          uuid: '550e8400-e29b-41d4-a716-446655440000',
          name: 'MetaMask',
          icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🦊</text></svg>',
          rdns: 'io.metamask',
        },
        provider: provider,
      }),
    });
    window.dispatchEvent(event);
  }

  window.addEventListener('eip6963:requestProvider', announceProvider);
  // Announce immediately for connectors that already requested before our script ran
  announceProvider();
})();
`;
}
