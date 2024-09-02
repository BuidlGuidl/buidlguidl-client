import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import minimist from "minimist";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const argv = minimist(process.argv.slice(2));
const installDir = path.join(__dirname, "ethereum_clients");
const rethDbPath = path.join(installDir, "reth", "database");
const lighthouseDbPath = path.join(installDir, "lighthouse", "database");

if (fs.existsSync(rethDbPath) || fs.existsSync(lighthouseDbPath)) {
  console.error(
    "Existing database folders detected. Please move or delete 'reth/database' and 'lighthouse/database' before proceeding."
  );
  process.exit(1);
}

if (!argv.u && !argv.url) {
  console.error("Please provide a URL using the -u or --url parameter.");
  process.exit(1);
}

const backupUrl = argv.u || argv.url;

async function downloadAndExtractBackup(url) {
  const backupDir = path.join(__dirname, "backups");
  const backupFileName = path.basename(url);
  const backupPath = path.join(backupDir, backupFileName);

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
  }

  try {
    console.log(`Downloading backup from ${url}...`);
    execSync(`curl -o ${backupPath} ${url}`, {
      stdio: "inherit",
    });

    console.log("Extracting backup...");
    execSync(`tar -xf ${backupPath} -C ${installDir}`, { stdio: "inherit" });

    console.log("Backup loaded successfully.");
  } catch (error) {
    console.error(`Error downloading or extracting backup: ${error.message}`);
    process.exit(1);
  }
}

(async () => {
  await downloadAndExtractBackup(backupUrl);
})();
