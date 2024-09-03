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

  // Function to get the public IP address
  async function getPublicIPAddress() {
    while (true) {
      try {
        const response = await axios.get("https://api.ipify.org?format=json");
        return response.data.ip;
      } catch (error) {
        debugToFile(`Error fetching public IP address: ${error}`, () => {});
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  // New function to fetch points
  async function fetchPoints(publicIP) {
    try {
      const response = await axios.get(
        `https://rpc.buidlguidl.com:48544/yourpoints?ipaddress=${publicIP}`
      );
      return response.data.points;
    } catch (error) {
      debugToFile(`Error fetching points: ${error}`, () => {});
      return null;
    }
  }

  // New function to update bigText with points
  async function updatePointsDisplay() {
    const publicIP = await getPublicIPAddress();
    const points = await fetchPoints(publicIP);
    if (points !== null) {
      bigText.setContent(
        `{center}{bold}B u i d l G u i d l  C l i e n t {/bold}{/center}\n` +
          `{center}{green-fg}Unclaimed Points: ${points}{/green-fg}{/center}\n` +
          `{center}{cyan-fg}${messageForHeader}{/cyan-fg}{/center}`
      );
      screen.render();
    }
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
    debugToFile(`pic: ${err}`, () => {});
  }

  const bigText = grid.set(0, 2, 1, 5, blessed.box, {
    content: `{center}{bold}B u i d l G u i d l  C l i e n t {/bold}{/center}\n{center}{cyan-fg}${messageForHeader}{/cyan-fg}{/center}`,
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
  const ipAddressBox = grid.set(0, 7, 1, 3, blessed.box, {
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

  // Initial points update
  updatePointsDisplay();

  // Schedule points update every 5 minutes
  setInterval(updatePointsDisplay, 5 * 60 * 1000);

  return { pic, bigText, ipAddressBox };
}
