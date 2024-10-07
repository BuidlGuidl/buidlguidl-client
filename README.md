# 📡 buidlguidl client
This project will download clients executables and start a Reth + Lighthouse node pair. Syncing the client databases will require ~1.2 TB of free space.

## Requirements
- node (https://nodejs.org/en)
- yarn (https://yarnpkg.com/migration/overview)

## Quickstart
To get a node started:
  ```bash
  git clone https://github.com/BuidlGuidl/buidlguidl-client.git
  cd buidlguidl-client
  yarn install
  node index.js
  ```

By default, client executables, databases, and logs will be established within /ethereum_clients. After initialization steps, the script displays a terminal view with scrolling client logs and some plots showing some machine and chain stats. Full client logs are located in ethereum_clients/reth/logs and ethereum_clients/lighthouse/logs. Exiting the terminal view (control-c or q) will also gracefully close your clients (can take 15 seconds or so).

If you want to specify a non-standard location for the ethereum_clients directory, pass a --directory (-d) option to index.js:
  ```bash
  node index.js --directory path/for/ethereum_clients
  ```

If you want to use a Geth + Prysm client pair, pass those as --executionclient (-e) and --consensusclient (-c) options to index.js:
  ```bash
  node index.js --executionclient geth --consensusclient prysm
  ```

You can opt in to the BuidlGuidl distributed RPC points system and earn points for serving RPC requests to the BuidlGuidl network by passing your eth address to the --owner (-o) option:
  ```bash
  node index.js --owner <your ENS name or eth address>
  ```

