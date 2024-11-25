# 📡 BuidlGuidl Client
This project will download client executables, start a execution + consensus client pair, and provide a terminal dashboard view of client and machine info.

&nbsp;
&nbsp;
## Hardware Requirements
See this [Rocket Pool Hardware Guide](https://docs.rocketpool.net/guides/node/local/hardware) for a nice rundown of node hardware requirements.

- Node operation doesn't require too much CPU power. We've ran the BG Client using both i3 and i5 versions of the [ASUS NUC 13 PRO](https://www.asus.com/us/displays-desktops/nucs/nuc-mini-pcs/asus-nuc-13-pro/). Note that there are some gotchas if you plan to use a Celeron processor. ([Rocket Pool Hardware Guide](https://docs.rocketpool.net/guides/node/local/hardware)).
- 32 GB of RAM works well with plenty of overhead.
- Selecting a suitable NVMe SSD is the trickiest part. You will need at least a 2 TB drive that includes a DRAM cache and DOES NOT use a Quad-level cell (QLC) architecture. The [Rocket Pool Hardware Guide](https://docs.rocketpool.net/guides/node/local/hardware) goes into more detail. This [SSD List GitHub Gist](https://gist.github.com/yorickdowne/f3a3e79a573bf35767cd002cc977b038) has a nice list of SSDs that have been tested and confirmed to work for running nodes.

&nbsp;
&nbsp;
## Dependencies
For Linux & MacOS:
- node (https://nodejs.org/en)
- yarn (https://yarnpkg.com/migration/overview)
- GNU Make (https://www.gnu.org/software/make/)

Additional MacOS Specifics:
- gnupg (https://gnupg.org/)
- Perl-Digest-SHA (https://metacpan.org/pod/Digest::SHA)

Hint: See the one line command below if you don't want to install the dependencies manually.

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

------------ OR ------------

Run this fancy one line command to check for/install dependencies and clone/run this repo (see https://client.buidlguidl.com/):
  ```bash
  /bin/bash -c "$(curl -fsSL https://bgclient.io)"
  ```

&nbsp;
&nbsp;

By default, client executables, databases, and logs will be established within buidlguidl-client/ethereum_clients. After initialization steps, the script displays a terminal view with scrolling client logs and some plots showing some machine and chain stats. Full client logs are located in buidlguidl-client/ethereum_clients/reth/logs and buidlguidl-client/ethereum_clients/lighthouse/logs. Exiting the terminal view (control-c or q) will also gracefully close your clients (can take 15 seconds or so).

&nbsp;
&nbsp;

## Startup Options

Use the --archive flag to perform an archive sync for the execution client:
  ```bash
  node index.js --archive
  ```

Omitting the --archive flag will make the execution clients perform a pruned sync that will give you full access to data from the last 10,064 blocks for Reth or the last 128 blocks for Geth.

&nbsp;
&nbsp;

You can opt in to the BuidlGuidl distributed RPC system and earn credits for serving RPC requests to the BuidlGuidl network by passing your eth address to the --owner (-o) option:
  ```bash
  node index.js --owner <your ENS name or eth address>
  ```

&nbsp;
&nbsp;

If you want to specify a non-standard location for the ethereum_clients directory, pass a --directory (-d) option to index.js:
  ```bash
  node index.js --directory path/for/directory/containing/ethereum_clients
  ```

&nbsp;
&nbsp;

If you want to use a Geth + Prysm client pair, pass those as --executionclient (-e) and --consensusclient (-c) options to index.js:
  ```bash
  node index.js --executionclient geth --consensusclient prysm
  ```

&nbsp;
&nbsp;

Pass the --update option to update the execution and consensus clients to the latest versions (that have been tested with the BG Client):
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

       --archive                            Perform an archive sync for the execution client

  -ep, --executionpeerport <port>           Specify the execution peer port (must be a number)
                                            Default: 30303

  -cp, --consensuspeerports <port>,<port>   Specify the execution peer ports (must be two comma-separated numbers)
                                            lighthouse defaults: 9000,9001. prysm defaults: 12000,13000

  -cc, --consensuscheckpoint <url>          Specify the consensus checkpoint server URL
                                            Lighthouse default: https://mainnet-checkpoint-sync.stakely.io/
                                            Prysm default: https://mainnet-checkpoint-sync.attestant.io/

  -d, --directory <path>                    Specify ethereum client executable, database, and logs directory
                                            Default: buidlguidl-client/ethereum_clients

  -o, --owner <eth address>                 Specify a owner eth address to opt in to the points system and distributed RPC network

      --update                              Update the execution and consensus clients to the latest version.
                                            Latest versions: Reth: 1.0.0, Geth: 1.14.12, Lighthouse: 5.3.0, (Prysm is handled by its executable automatically)

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