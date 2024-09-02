import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { installDir } from "./commandLineOptions.js";

const ethereumClientsDir = path.join(installDir, "ethereum_clients");
const backupDir = path.join(__dirname, "backups");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupFileName = `ethereum_clients_backup_${timestamp}.tar`;
const backupPath = path.join(backupDir, backupFileName);

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir);
}

function formatSize(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

function monitorBackupProgress() {
  let lastSize = 0;
  const interval = setInterval(() => {
    if (fs.existsSync(backupPath)) {
      const stats = fs.statSync(backupPath);
      const currentSize = stats.size;
      const delta = currentSize - lastSize;
      console.log(
        `Backup size: ${formatSize(currentSize)} (+${formatSize(delta)}/s)`
      );
      lastSize = currentSize;
    }
  }, 1000);

  return interval;
}

function makeBackup() {
  const rethDbPath = path.join(ethereumClientsDir, "reth", "database");
  const lighthouseDbPath = path.join(
    ethereumClientsDir,
    "lighthouse",
    "database"
  );

  const command =
    `tar -cf "${backupPath}" -C "${ethereumClientsDir}" ` +
    `"reth/database" "lighthouse/database"`;

  console.log("Starting backup...");
  const progressInterval = monitorBackupProgress();

  exec(command, (error, stdout, stderr) => {
    clearInterval(progressInterval);

    if (error) {
      console.error(`Error creating backup: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`Backup process encountered an issue: ${stderr}`);
      return;
    }
    const finalStats = fs.statSync(backupPath);
    console.log(`Backup completed successfully at: ${backupPath}`);
    console.log(`Final backup size: ${formatSize(finalStats.size)}`);
  });
}

makeBackup();
