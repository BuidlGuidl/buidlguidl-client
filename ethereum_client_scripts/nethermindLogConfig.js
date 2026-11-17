import fs from "fs";

// Nethermind logs "Waiting for an IPC connection..." at info level every time
// an IPC connection closes, and BG client asks it for admin_peers over IPC
// every 5 seconds (the peer count gauge), so the line fills both the log box
// and the log file. Its --Init.LogRules option can only add logging, not
// silence a logger the default rules print at info (tried on 2.2.2), so this
// writes a copy of the NLog.config that ships with the installed nethermind
// with one rule added in front: drop JsonRpcIpcRunner's messages up to info.
// Its warnings and errors still go through. The copy is rebuilt from the
// shipped file at every start, so it follows nethermind upgrades.

const IPC_RUNNER_RULE =
  '<logger name="Runner.JsonRpc.JsonRpcIpcRunner" maxlevel="Info" final="true" />';

// Writes the config to outPath and returns outPath, or null (nethermind then
// runs with its own config) if the shipped file can't be read or changed.
export function writeNethermindLogConfig(shippedConfigPath, outPath) {
  try {
    const shipped = fs.readFileSync(shippedConfigPath, "utf8");
    const rulesAt = shipped.indexOf("<rules>");
    if (rulesAt === -1) return null;
    const insertAt = rulesAt + "<rules>".length;
    const config =
      shipped.slice(0, insertAt) +
      `\n    ${IPC_RUNNER_RULE}` +
      shipped.slice(insertAt);
    fs.writeFileSync(outPath, config);
    return outPath;
  } catch {
    return null;
  }
}
