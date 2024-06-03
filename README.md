# 📡 buidlguidl client
This project will download clients and start an ethereum node. Currently it uses a Geth + Prysm client pair (with other options available soon). The script runs Geth in snap sync mode and will require ~1.2 TB.

## Requirements
- node (https://nodejs.org/en)
- yarn (https://yarnpkg.com/migration/overview)

## Quickstart
To get a node started:
  ```bash
  git clone https://github.com/BuidlGuidl/nodes-script.git
  cd nodes-script
  yarn install
  node index.js
  ```

By default, index.js will create ~/bgnode which will contain the client executables, databases, and client logs. The script then displays a terminal view with scrolling client logs and some plots showing some machine stats. Full client logs are located in bgnode/geth/logs and bgnode/prysm/logs. Exiting the terminal view (control-c or q) will also close your clients (will take 15 seconds or so).

If you want to specify the location of the bgnode directory, pass a -d option to index.js:
  ```bash
  node index.js -d path/for/bgnode
  ```

## Known Issues
- The disk usage gauge in the terminal view will display your space for the OS drive even if you specify a install path on a separate drive.
- Macs running OS 14.x can throw an error looking something like this: "shasum is not available. Either install it or run with PRYSM_ALLOW_UNVERIFIED_BINARIES=1". If you have that issue you likely need to run the following using homebrew (https://brew.sh/):
  ```bash
  brew reinstall gnupg
  ```
  If the error persists you might also need to install perl-Digest-SHA like:
    ```bash
    brew install perl
    brew install cpanminus
    cpanm Digest::SHA
    ```