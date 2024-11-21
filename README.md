# 📡 BuidlGuidl Client
This project will download clients executables and start a Reth + Lighthouse node pair. Syncing the client databases will require ~1.4 TB of free space.

&nbsp;
&nbsp;
## Requirements
- node (https://nodejs.org/en)
- yarn (https://yarnpkg.com/migration/overview)

&nbsp;
&nbsp;
## Quickstart
To get a full node started using a Reth + Lighthouse client pair:
  ```bash
  git clone https://github.com/BuidlGuidl/buidlguidl-client.git
  cd buidlguidl-client
  yarn install
  node index.js
  ```

By default, client executables, databases, and logs will be established within /ethereum_clients. After initialization steps, the script displays a terminal view with scrolling client logs and some plots showing some machine and chain stats. Full client logs are located in ethereum_clients/reth/logs and ethereum_clients/lighthouse/logs. Exiting the terminal view (control-c or q) will also gracefully close your clients (can take 15 seconds or so).

&nbsp;
&nbsp;

If you want to specify a non-standard location for the ethereum_clients directory, pass a --directory (-d) option to index.js:
  ```bash
  node index.js --directory path/for/ethereum_clients
  ```

&nbsp;
&nbsp;

If you want to use a Geth + Prysm client pair, pass those as --executionclient (-e) and --consensusclient (-c) options to index.js:
  ```bash
  node index.js --executionclient geth --consensusclient prysm
  ```

&nbsp;
&nbsp;

You can opt in to the BuidlGuidl distributed RPC points system and earn points for serving RPC requests to the BuidlGuidl network by passing your eth address to the --owner (-o) option:
  ```bash
  node index.js --owner <your ENS name or eth address>
  ```

&nbsp;
&nbsp;

Pass the --update option to update the execution and consensus clients to the latest version:
  ```bash
  node index.js --update
  ```

&nbsp;
&nbsp;

Use the --help (-h) option to see all command line options:
  ```bash
  node index.js --help

  -e, --executionclient <client>            Specify the execution client ('reth' or 'geth')
                                            Default: reth

  -c, --consensusclient <client>            Specify the consensus client ('lighthouse' or 'prysm')
                                            Default: lighthouse

  -ep, --executionpeerport <port>           Specify the execution peer port (must be a number)
                                            Default: 30303

  -cp, --consensuspeerports <port>,<port>   Specify the execution peer ports (must be two comma-separated numbers)
                                            Lighthouse defaults: 9000,9001. prysm defaults: 12000,13000

  -cc, --consensuscheckpoint <url>          Specify the consensus checkpoint server URL
                                            Lighthouse default: https://mainnet-checkpoint-sync.stakely.io/
                                            Prysm default: https://mainnet-checkpoint-sync.attestant.io/

  -d, --directory <path>                    Specify ethereum client executable, database, and logs directory
                                            Default: buidlguidl-client/ethereum_clients

  -o, --owner <eth address>                 Specify a owner eth address to opt in to the points system and distributed RPC

      --update                              Update the execution and consensus clients to the latest version.
                                            Latest versions: Reth: 1.0.0, Geth: 1.14.12, Lighthouse: 5.3.0

  -h, --help                                Display this help message and exit
  ```

&nbsp;
&nbsp;
## Common Questions and Issues
The consensus clients (Lighthouse and Prysm) require a checkpoint sync server URL to initiate sync. Connection to checkpoint servers can fail depending on your location. If the consensus client fails to start the sync and you see an error message in the Lighthouse/Prysm logs like this:

```bash
Nov 21 17:45:41.833 INFO Starting checkpoint sync                remote_url: https://mainnet-checkpoint-sync.stakely.io/, service: beacon
Nov 21 17:45:51.842 CRIT Failed to start beacon node             reason: Error loading checkpoint state from remote: HttpClient(, kind: timeout, detail: operation timed out)
Nov 21 17:45:51.843 INFO Internal shutdown received              reason: Failed to start beacon node
Nov 21 17:45:51.843 INFO Shutting down..                         reason: Failure("Failed to start beacon node")
Failed to start beacon node
```

You will need to specify a different checkpoint server URL using the --consensuscheckpoint (-cc) option. See https://eth-clients.github.io/checkpoint-sync-endpoints/ for a list of public checkpoint sync servers.

&nbsp;
&nbsp;

The consensus client logs can output many warnings while syncing (see below for some Lighthouse examples). These warnings can be ignored and will resolve after the execution client has synced. They look scary but it's expected behavior.

```bash
Nov 21 20:58:53.309 INFO Block production disabled               reason: no eth1 backend configured
Nov 21 21:01:16.144 WARN Blocks and blobs request for range received invalid data, error: MissingBlobs, sender_id: BackfillSync { batch_id: Epoch(326557) }, peer_id: 16Uiu2HAkv5priPv8S7bawF8u96aAMgAbtkh95x4PkDvm7WSdH3ER, service: sync
Nov 21 21:01:17.001 WARN Head is optimistic                      execution_block_hash: 0x16410f3d5cb5044dcf596b301a34ec88ffce09dd4346f04aea95d442b1456e62, info: chain not fully verified, block and attestation production disabled until execution engine syncs, service: slot_notifier
Nov 21 21:01:44.997 WARN Execution engine call failed            error: InvalidClientVersion("Input must be exactly 8 characters long (excluding any '0x' prefix)"), service: exec
Nov 21 21:01:59.013 WARN Error signalling fork choice waiter     slot: 10449907, error: ForkChoiceSignalOutOfOrder { current: Slot(10449908), latest: Slot(10449907) }, service: beacon
``` 