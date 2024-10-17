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
import { isConnected } from "../web_socket_connection/webSocketConnection.js";

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

  let ipAddressBoxContent = `{center}{bold}Local IP: Fetching...{/bold}\n{center}{bold}Public IP: Fetching...{/bold}{/center}`;

  // Create the IP address box
  const ipAddressBox = grid.set(0, 7, 1, 2, blessed.box, {
    content: ipAddressBoxContent,
    tags: true,
    align: "center",
    valign: "top",
    style: {
      fg: "white",
      border: {
        fg: "cyan",
      },
    },
  });

  let rpcStatusMessage = "";
  let showIPAddresses = true;
  let lastToggleTime = Date.now();

  function updateWSStatusMessage() {
    // Update the RPC status message
    if (owner !== null) {
      if (isConnected) {
        rpcStatusMessage =
          "{center}{green-fg}RPC Server Connected{/green-fg}{/center}";
      } else {
        rpcStatusMessage =
          "{center}{red-fg}RPC Server Disconnected{/red-fg}{/center}";
      }
    }

    const ipAddressLines = ipAddressBoxContent
      .split("\n")
      .slice(0, 2)
      .join("\n");
    const currentTime = Date.now();

    if (owner !== null && ipAddressBox.height < 5) {
      if (currentTime - lastToggleTime >= 10000) {
        showIPAddresses = !showIPAddresses;
        lastToggleTime = currentTime;
      }

      const contentToShow = showIPAddresses ? ipAddressLines : rpcStatusMessage;
      ipAddressBox.setContent(contentToShow);
    } else {
      // If height is 5 or more, show all information
      ipAddressBox.setContent(`${ipAddressLines}\n${rpcStatusMessage}`);
    }

    screen.render();
  }

  // Update the IP address fetching part
  Promise.all([getIPAddress(), getPublicIPAddress()]).then(
    ([localIP, publicIP]) => {
      ipAddressBoxContent = `{center}{bold}Local IP: ${localIP}{/bold}\n{center}{bold}Public IP: ${publicIP}{/bold}{/center}`;
      updateWSStatusMessage(); // Call this to add the initial RPC status
      screen.render();
    }
  );

  updatePointsAndBranchDisplay();
  setInterval(updatePointsAndBranchDisplay, 1 * 60 * 1000); // Every 1 minute
  setInterval(updateWSStatusMessage, 1000); // Check every second for smoother transitions

  // Add resize event listener
  screen.on("resize", () => {
    // Force an immediate update after resize
    lastToggleTime = Date.now() - 10000;
    updateWSStatusMessage();
  });

  return { pic, bigText, ipAddressBox };
}
