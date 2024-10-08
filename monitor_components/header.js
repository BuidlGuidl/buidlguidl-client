import blessed from "blessed";
import os from "os";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { debugToFile } from "../helpers.js";
import { execSync } from "child_process";
import { getPublicIPAddress } from "../getSystemStats.js";
import { exec } from "child_process";
import { owner } from "../commandLineOptions.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function createHeader(grid, screen, messageForHeader) {
  // Function to get the local IP address
  async function getIPAddress() {
    while (true) {
      const interfaces = os.networkInterfaces();
      for (const iface in interfaces) {
        for (const alias of interfaces[iface]) {
          if (alias.family === "IPv4" && !alias.internal) {
            return alias.address;
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  debugToFile(`monitor_components/header.js: owner: ${owner}`);

  // New function to fetch points
  async function fetchPoints(owner) {
    try {
      const response = await axios.get(
        `https://rpc.buidlguidl.com:48544/yourpoints?owner=${owner}`
      );
      return response.data.points;
    } catch (error) {
      debugToFile(`Error fetching points: ${error}`);
      return null;
    }
  }

  // New function to get the current Git branch
  function getCurrentBranch() {
    try {
      return execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
    } catch (error) {
      debugToFile(`Error getting current branch: ${error}`);
      return "unknown";
    }
  }

  // Updated function to get the full Git commit hash
  function getCurrentCommitHash() {
    try {
      return execSync("git rev-parse HEAD").toString().trim();
    } catch (error) {
      debugToFile(`Error getting current commit hash: ${error}`);
      return "unknown";
    }
  }

  // Updated function to update bigText with points, branch name, and commit hash
  async function updatePointsAndBranchDisplay() {
    const points = await fetchPoints(owner);
    const currentBranch = getCurrentBranch();
    const commitHash = getCurrentCommitHash();
    if (owner !== null) {
      bigText.setContent(
        `{center}{bold}B u i d l G u i d l  C l i e n t{/bold}{/center}\n` +
          `{center}Branch: ${currentBranch} (${commitHash}){/center}\n` +
          `{center}{cyan-fg}Owner: ${owner}{/cyan-fg} | {green-fg}Unclaimed Points: ${points}{/green-fg}{/center}\n` +
          `{center}{cyan-fg}${messageForHeader}{/cyan-fg}{/center}`
      );
    } else {
      bigText.setContent(
        `{center}{bold}B u i d l G u i d l  C l i e n t{/bold}{/center}\n` +
          `{center}Branch: ${currentBranch} (${commitHash}){/center}\n` +
          `{center}{cyan-fg}${messageForHeader}{/cyan-fg}{/center}`
      );
    }
    screen.render();
  }

  let pic, logo;
  try {
    pic = grid.set(0, 0, 1, 2, blessed.box, {
      border: false,
      valign: "top",
      padding: { top: 0, bottom: 0, left: 0, right: 0 },
      align: "center",
    });

    const renderLogo = () => {
      const logoHeight = pic.height * 1.1; // Use the height of the pic box
      const logoWidth = logoHeight + logoHeight * 1.5; // Adjust width as needed
      const leftPosition = Math.floor((pic.width - logoWidth) / 2);

      // If logo already exists, remove it before adding a new one
      if (logo) {
        pic.remove(logo);
      }

      logo = blessed.image({
        parent: pic,
        file: path.join(__dirname, "pixelBgLogo.png"),
        type: "ansi", // or "overlay" depending on your terminal capabilities
        width: logoWidth,
        height: logoHeight,
        left: leftPosition,
        top: -1,
      });

      pic.screen.render(); // Rerender the screen after updating the logo
    };

    // Initial render
    renderLogo();

    // Listen for resize events and rerender the logo
    pic.screen.on("resize", () => {
      renderLogo();
    });
  } catch (err) {
    debugToFile(`pic: ${err}`);
  }

  const bigText = grid.set(0, 2, 1, 5, blessed.box, {
    content: `{center}{bold}B u i d l G u i d l  C l i e n t{/bold}{/center}\n{center}{cyan-fg}${messageForHeader}{/cyan-fg}{/center}`,
    tags: true,
    align: "center",
    valign: "middle",
    style: {
      fg: "white",
      border: {
        fg: "cyan",
      },
      // hover: {
      //   fg: "cyan",
      // },
    },
    // mouse: true,
    // clickable: true,
  });

  // bigText.on("click", function () {
  //   const url = "https://client.buidlguidl.com"; // Replace with your desired URL
  //   let command;
  //   switch (process.platform) {
  //     case "darwin":
  //       command = `open ${url}`;
  //       break;
  //     case "win32":
  //       command = `start ${url}`;
  //       break;
  //     default:
  //       command = `xdg-open ${url}`;
  //   }
  //   exec(command, (error) => {
  //     if (error) {
  //       debugToFile(`Error opening URL: ${error}`);
  //     }
  //   });
  // });

  // Create the IP address box
  const ipAddressBox = grid.set(0, 7, 1, 2, blessed.box, {
    content: `{center}{bold}IP Address: Fetching... {/bold}\n{center}{bold}Public IP: Fetching...{/bold}{/center}`,
    tags: true,
    align: "center",
    valign: "middle",
    style: {
      fg: "white",
      border: {
        fg: "cyan",
      },
    },
  });

  // Fetch and display both IP addresses
  Promise.all([getIPAddress(), getPublicIPAddress()]).then(
    ([localIP, publicIP]) => {
      ipAddressBox.setContent(
        `{center}{bold}Local IP: ${localIP}{/bold}\n{center}{bold}Public IP: ${publicIP}{/bold}{/center}`
      );
      screen.render();
    }
  );

  // Replace updatePointsDisplay with updatePointsAndBranchDisplay
  updatePointsAndBranchDisplay();

  // Schedule points and branch update every 1 minutes
  setInterval(updatePointsAndBranchDisplay, 1 * 60 * 1000);

  return { pic, bigText, ipAddressBox };
}
