# 📡 BuidlGuidl Client
This project will download clients executables and start a Reth + Lighthouse node pair. Syncing the client databases will require ~1.2 TB of free space.

&nbsp;
&nbsp;
## Requirements  📋
- node (https://nodejs.org/en)
- yarn (https://yarnpkg.com/migration/overview)

&nbsp;
&nbsp;
## Quickstart  🚀
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
## Startup Options  🎛️
You can opt in to the BuidlGuidl distributed RPC points system and earn points for serving RPC requests to the BuidlGuidl network by passing your eth address to the --owner (-o) option:
  ```bash
  node index.js --owner <your ENS name or eth address>
  ```
&nbsp;

The BuidlGuidl Client can also run a Geth + Prysm client pair. If Geth and Prysm is your jam, pass those as --executionclient (-e) and --consensusclient (-c) options to index.js:
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
## Hardware Selection  💻
<!-- The BuidlGuidl team has tested and confirmed that the following economical hardware works great for running a BG Client:
- [ASUS NUC 13 PRO i3 (RNUC13ANKI30000UI)](https://www.newegg.com/asus-rnuc13anki30000ui-nuc-13-pro-intel-core-i3-1315u/p/N82E16856110280?Item=N82E16856110280)
- [KingSpec XG 7000 2TB M.2 2280 PCIe SSD](https://www.newegg.com/kingspec-2tb-xg-7000-series/p/0D9-000D-00172?Item=9SIB1V8JVN5929)
- [CORSAIR Vengeance 32GB (2 x 16GB) DDR4 3200 (CMSX32GX4M2A3200C22)](https://www.newegg.com/corsair-32gb-260-pin-ddr4-so-dimm-ddr4-3200/p/N82E16820236681?Item=N82E16820236681)

&nbsp; -->

Be aware that there are some gotchas when selecting hardware. This [Rocket Pool Node Hardware Guide](https://docs.rocketpool.net/guides/node/local/hardware) is a great resource for overall hardware selection guidelines. Selecting the correct SSD is critical. With a lacking drive, your client will be unable to keep up with the chain ☹️. This [GitHub Doc](https://gist.github.com/yorickdowne/f3a3e79a573bf35767cd002cc977b038) is an ever-growing list of SSDs that have been tested and confirmed to work for a node.

Some main takeaways:
- If selecting an intel processor, it's best to just go with an i-series (modern i3 works just fine; we've been using this [ASUS NUC](https://www.newegg.com/asus-rnuc13anki30000ui-nuc-13-pro-intel-core-i3-1315u/p/N82E16856110280?Item=N82E16856110280) for testing). If you're eyeing something with a Celeron processor you must confirm that it supports [BMI2](https://en.wikipedia.org/wiki/X86_Bit_manipulation_instruction_set#BMI2_(Bit_Manipulation_Instruction_Set_2)).
- Running a node is a drive read/write intensive task. You will want to select an NVMe SSD.
- Make sure your SSD has a Triple-level cell (TLC), Multi-level cell (MLC), or Single-level cell (SLC) architecture. Quad-level cell (QLC) SSDs are a no-go 👎. QLC SSDs are just too slow and lack the reliability for the I/Os that the BG Client requires.
- You additionally need to make sure that your SSD has an onboard DRAM cache. Sometimes the marketing materials are not explicit about the inclusion of DRAM so you may need to do some digging. When in doubt, you can always go by [what other node runners have already tested](https://gist.github.com/yorickdowne/f3a3e79a573bf35767cd002cc977b038).
