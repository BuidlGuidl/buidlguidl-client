import blessed from "blessed";
import os from "os";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { debugToFile } from "../helpers.js";
import { execSync } from "child_process";
import { getPublicIPAddress } from "../getSystemStats.js";
import { owner } from "../commandLineOptions.js";
import { isConnected } from "../webSocketConnection.js";
import { BASE_URL, BREAD_CONTRACT_ADDRESS } from "../config.js";
import { baseSepoliaPublicClient } from "../chain_utills/baseSepoliaPublicClient.js";
import { mainnetPublicClient } from "../chain_utills/mainnetPublicClient.js";
import { breadContractAbi } from "../chain_utills/breadContractAbi.js";
import { isAddress, formatUnits } from "viem";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function createHeader(grid, screen, messageForHeader) {
  // Store branch info once on startup
  let currentBranch = "unknown";
  let commitHash = "unknown";

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

  // New function to fetch pending bread
  async function fetchPendingBread(owner) {
    try {
      const response = await axios.get(
        `https://${BASE_URL}:48546/yourpendingbread?owner=${owner}`
      );
      return response.data.bread;
    } catch (error) {
      debugToFile(`Error fetching pending bread: ${error}`);
      return null;
    }
  }

  async function fetchBread(owner) {
    try {
      if (!owner) return null;

      let resolvedAddress = owner;

      // Resolve ENS name if needed
      if (owner.endsWith(".eth")) {
        try {
          resolvedAddress = await mainnetPublicClient.getEnsAddress({
            name: owner,
          });
          if (!resolvedAddress) {
            debugToFile(`Could not resolve ENS name: ${owner}`);
            return null;
          }
        } catch (error) {
          debugToFile(`Error resolving ENS name ${owner}: ${error}`);
          return null;
        }
      } else if (!isAddress(owner)) {
        debugToFile(`Invalid address format: ${owner}`);
        return null;
      }

      // Get bread balance from the contract
      const balance = await baseSepoliaPublicClient.readContract({
        address: BREAD_CONTRACT_ADDRESS,
        abi: breadContractAbi,
        functionName: "balanceOf",
        args: [resolvedAddress],
      });

      // Convert from wei to readable format (assuming 18 decimals)
      return formatUnits(balance, 18);
    } catch (error) {
      debugToFile(`Error fetching bread balance: ${error}`);
      return null;
    }
  }

  // Function to get git branch info once on startup
  function initializeBranchInfo() {
    try {
      currentBranch = execSync("git rev-parse --abbrev-ref HEAD")
        .toString()
        .trim();
    } catch (error) {
      debugToFile(`Error getting current branch: ${error}`);
      currentBranch = "unknown";
    }

    try {
      commitHash = execSync("git rev-parse HEAD").toString().trim();
    } catch (error) {
      debugToFile(`Error getting current commit hash: ${error}`);
      commitHash = "unknown";
    }
  }

  // Function to update only bread amounts (called every minute)
  async function updateBreadDisplay() {
    let pendingBread = null;
    let bread = null;

    // Only fetch bread amounts if owner is set
    if (owner !== null) {
      pendingBread = await fetchPendingBread(owner);
      bread = await fetchBread(owner);
    }

    if (owner !== null) {
      const pendingBreadDisplay = pendingBread !== null ? pendingBread : "0";
      const breadDisplay =
        bread !== null ? Math.floor(parseFloat(bread)).toString() : "0";

      bigText.setContent(
        `{center}{bold}B u i d l G u i d l  C l i e n t{/bold}{/center}\n` +
          `{center}Branch: ${currentBranch} (${commitHash}){/center}\n` +
          `{center}{cyan-fg}Owner: ${owner}{/cyan-fg} | {green-fg}Pending Bread: ${pendingBreadDisplay}{/green-fg} | {green-fg}Bread: ${breadDisplay}{/green-fg}{/center}\n` +
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
    valign: "top",
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
      if (isConnected(process.pid)) {
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

  // Initialize branch info once on startup
  initializeBranchInfo();

  updateBreadDisplay();
  setInterval(updateBreadDisplay, 1 * 5 * 1000); // Every 1 minute
  setInterval(updateWSStatusMessage, 1000); // Check every second for smoother transitions

  // Add resize event listener
  screen.on("resize", () => {
    // Force an immediate update after resize
    lastToggleTime = Date.now() - 10000;
    updateWSStatusMessage();
  });

  return { pic, bigText, ipAddressBox };
}
