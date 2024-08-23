import blessed from "blessed";
import os from "os";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { debugToFile } from "../helpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function createHeader(grid, screen, messageForHeader) {
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
      return "IP not found";
    }
  }

  // const picOptions = {
  //   file: path.join(__dirname, "pixelBgLogo.png"),
  //   cols: 12,
  //   onReady: ready,
  // };

  // function ready() {
  //   // screen.render();
  // }

  // const pic = grid.set(0, 0, 1, 2, contrib.picture, picOptions);
  // debugToFile(`pic.height: ${pic.height}`, () => {});

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
    debugToFile(`pic: ${err}`, () => {});
  }

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
