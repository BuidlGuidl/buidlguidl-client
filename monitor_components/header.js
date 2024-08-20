import blessed from "blessed";
import contrib from "blessed-contrib";
import os from "os";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { debugToFile } from "../helpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function createHeader(grid, screen, messageForHeader) {
  const picOptions = {
    file: path.join(__dirname, "pixelBgLogo.png"),
    cols: 12,
    onReady: ready,
  };

  function ready() {
    // screen.render();
  }

  // Function to get the local IP address
  function getIPAddress() {
    const interfaces = os.networkInterfaces();
    for (const iface in interfaces) {
      for (const alias of interfaces[iface]) {
        if (alias.family === "IPv4" && !alias.internal) {
          return alias.address;
        }
      }
    }
    return "IP not found";
  }

  // Function to get the public IP address
  async function getPublicIPAddress() {
    try {
      const response = await axios.get("https://api.ipify.org?format=json");
      return response.data.ip;
    } catch (error) {
      debugToFile(`Error fetching public IP address: ${error}`, () => {});
      return "Public IP not found";
    }
  }

  const pic = grid.set(0, 0, 1, 2, contrib.picture, picOptions);

  const bigText = grid.set(0, 2, 1, 4, blessed.box, {
    content: `{center}{bold}B u i d l G u i d l  C l i e n t {/bold}{/center}\n{center}{red-fg}${messageForHeader}{/red-fg}{/center}`,
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

  // Create the IP address box
  const ipAddressBox = grid.set(0, 6, 1, 4, blessed.box, {
    content: `{center}{bold}IP Address: ${getIPAddress()} {/bold}\n{center}{bold}Public IP: Fetching...{/bold}{/center}`,
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

  // screen.render();

  // Fetch and display the public IP address
  getPublicIPAddress().then((publicIP) => {
    ipAddressBox.setContent(
      `{center}{bold}Local IP: ${getIPAddress()}{/bold}\n{center}{bold}Public IP: ${publicIP}{/bold}{/center}`
    );
    screen.render();
  });

  return { pic, bigText, ipAddressBox };
}
