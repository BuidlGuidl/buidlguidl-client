const blessed = require('blessed');
const contrib = require('blessed-contrib');
const os = require('os');
const axios = require('axios');
const path = require('path');

function createHeader(grid, screen, messageForHeader) {
  const picOptions = { 
    file: path.join(__dirname, 'pixelBgLogo.png'), 
    cols: 12, 
    onReady: ready 
  };

  function ready() {
    // screen.render();
  }

  // Function to get the local IP address
  function getIPAddress() {
    const interfaces = os.networkInterfaces();
    for (const iface in interfaces) {
      for (const alias of interfaces[iface]) {
        if (alias.family === 'IPv4' && !alias.internal) {
          return alias.address;
        }
      }
    }
    return 'IP not found';
  }

  // Function to get the public IP address
  async function getPublicIPAddress() {
    try {
      const response = await axios.get('https://api.ipify.org?format=json');
      return response.data.ip;
    } catch (error) {
      console.error('Error fetching public IP address:', error);
      return 'Public IP not found';
    }
  }

  const pic = grid.set(0, 0, 1, 1, contrib.picture, picOptions);

  const bigText = grid.set(0, 1, 1, 4, blessed.box, {
    content: `{center}{bold}B u i d l G u i d l  N o d e {/bold}{/center}\n{center}{red-fg}${messageForHeader}{/red-fg}{/center}`,
    tags: true,
    align: 'center',
    valign: 'middle',
    style: {
      fg: 'white',
      border: {
        fg: 'cyan'
      }
    }
  });

  // Create the IP address box 
  const ipAddressBox = grid.set(0, 5, 1, 4, blessed.box, {
    content: `{center}{bold}IP Address: ${getIPAddress()} {/bold}\n{center}{bold}Public IP: Fetching...{/bold}{/center}`,
    tags: true,
    align: 'center',
    valign: 'middle',
    style: {
      fg: 'white',
      border: {
        fg: 'cyan'
      }
    }
  });

  // screen.render();

  // Fetch and display the public IP address
  getPublicIPAddress().then(publicIP => {
    ipAddressBox.setContent(`{center}{bold}IP Address: ${getIPAddress()}{/bold}\n{center}{bold}Public IP: ${publicIP}{/bold}{/center}`);
    screen.render();
  });

  return { pic, bigText, ipAddressBox };
}

module.exports = { createHeader};
