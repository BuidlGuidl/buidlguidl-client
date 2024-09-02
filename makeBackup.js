import { cp } from "fs/promises";
import fs from "fs";
import path from "path";
import os from "os";
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

async function makeBackup() {
  console.log("Starting backup...");
  const progressInterval = monitorBackupProgress();

  try {
    await cp(ethereumClientsDir, backupPath, { recursive: true });
    clearInterval(progressInterval);
    const finalStats = fs.statSync(backupPath);
    console.log(`Backup completed successfully at: ${backupPath}`);
    console.log(`Final backup size: ${formatSize(finalStats.size)}`);
  } catch (error) {
    clearInterval(progressInterval);
    console.error(`Error creating backup: ${error.message}`);
  }
}

makeBackup();
