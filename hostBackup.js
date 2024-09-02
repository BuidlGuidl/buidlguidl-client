import express from "express";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 56942;

const backupDir = path.join(__dirname, "backups");

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

app.get("/", (req, res) => {
  fs.readdir(backupDir, (err, files) => {
    if (err) {
      return res.status(500).send("Error reading backup directory");
    }

    const backups = files
      .filter((file) => file.endsWith(".tar"))
      .map((file) => {
        const stats = fs.statSync(path.join(backupDir, file));
        return {
          name: file,
          size: formatSize(stats.size),
          date: stats.mtime.toISOString().split("T")[0],
        };
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Ethereum Clients Backups</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
            table { border-collapse: collapse; width: 100%; }
            th, td { text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }
            th { background-color: #f2f2f2; }
            tr:hover { background-color: #f5f5f5; }
          </style>
        </head>
        <body>
          <h1>Ethereum Clients Backups</h1>
          <table>
            <tr>
              <th>Filename</th>
              <th>Size</th>
              <th>Date</th>
              <th>Action</th>
            </tr>
            ${backups
              .map(
                (backup) => `
              <tr>
                <td>${backup.name}</td>
                <td>${backup.size}</td>
                <td>${backup.date}</td>
                <td><a href="/download/${backup.name}">Download</a></td>
              </tr>
            `
              )
              .join("")}
          </table>
        </body>
      </html>
    `;

    res.send(html);
  });
});

app.get("/download/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(backupDir, filename);

  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).send("File not found");
  }
});

app.listen(port, () => {
  console.log(`Backup server running at http://localhost:${port}`);
});
