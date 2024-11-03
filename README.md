# 📡 BuidlGuidl Client
This project will download clients executables and start a Reth + Lighthouse node pair. Syncing the client databases will require ~1.2 TB of free space.

&nbsp;
&nbsp;
## Requirements
- node (https://nodejs.org/en)
- yarn (https://yarnpkg.com/migration/overview)

&nbsp;
&nbsp;
## Quickstart
To get a node started:
  ```bash
  git clone https://github.com/BuidlGuidl/buidlguidl-client.git
  cd buidlguidl-client
  yarn install
  node index.js
  ```
&nbsp;

By default, client executables, databases, and logs will be established within /ethereum_clients. After initialization steps, the script displays a terminal view with scrolling client logs and some plots showing some machine and chain stats. Full client logs are located in ethereum_clients/reth/logs and ethereum_clients/lighthouse/logs. Exiting the terminal view (control-c or q) will also gracefully close your clients (can take 15 seconds or so).

&nbsp;
&nbsp;
## Startup Options
You can opt in to the BuidlGuidl distributed RPC points system and earn points for serving RPC requests to the BuidlGuidl network by passing your eth address to the --owner (-o) option:
  ```bash
  node index.js --owner <your ENS name or eth address>
  ```
&nbsp;

If you want to use a Geth + Prysm client pair, pass those as --executionclient (-e) and --consensusclient (-c) options to index.js:
  ```bash
  node index.js --executionclient geth --consensusclient prysm
  ```
&nbsp;

If you want to specify a non-standard location for the ethereum_clients directory, pass a --directory (-d) option to index.js:
  ```bash
  node index.js --directory path/for/ethereum_clients
  ```
&nbsp;

Use the --help (-h) option to see all the available options:
  ```bash
  node index.js --help

  -e, --executionclient <client>            Specify the execution client ('reth' or 'geth')
                                            Default: reth

  -c, --consensusclient <client>            Specify the consensus client ('lighthouse' or 'prysm')
                                            Default: lighthouse

  -ep, --executionpeerport <port>           Specify the execution peer port (must be a number)
                                            Default: 30303

  -cp, --consensuspeerports <port>,<port>   Specify the execution peer ports (must be two comma-separated numbers)
                                            lighthouse defaults: 9000,9001. prysm defaults: 12000,13000

  -cc, --consensuscheckpoint <url>          Specify the consensus checkpoint server URL
                                            lighthouse default: https://mainnet-checkpoint-sync.stakely.io/. prysm default: https://mainnet-checkpoint-sync.attestant.io/

  -d, --directory <path>                    Specify ethereum client executable, database, and logs directory
                                            Default: buidlguidl-client/ethereum_clients

  -o, --owner <eth address>                 Specify a owner eth address to opt in to the points system and distributed RPC network

  -h, --help                                Display this help message and exit
  ```

&nbsp;
&nbsp;
## Hardware Selection
The BuidlGuidl team has tested and confirmed that the following hardware works just fine for running a BG Client:
- [ASUS NUC 13 PRO i3 (RNUC13ANKI30000UI)] (https://www.newegg.com/asus-rnuc13anki30000ui-nuc-13-pro-intel-core-i3-1315u/p/N82E16856110280?Item=N82E16856110280)