const contrib = require("blessed-contrib");

function createPeerCountLcd(grid) {
  const peerCountLcd = contrib.lcd({
    segmentWidth: 0.06, // how wide are the segments in % so 50% = 0.5
    segmentInterval: 0.11, // spacing between the segments in % so 50% = 0.550% = 0.5
    strokeWidth: 0.11, // spacing between the segments in % so 50% = 0.5
    elements: 3, // how many elements in the display. or how many characters can be displayed.
    display: 0, // what should be displayed before first call to setDisplay
    elementSpacing: 4, // spacing between each element
    elementPadding: 2, // how far away from the edges to put the elements
    color: "green", // color for the segments
    label: "Peer Count",
    top: "55%",
    height: "10%",
    left: "80%",
    width: "10%",
    border: {
      type: "line",
      fg: "cyan",
    },
  });

  return peerCountLcd;
}

module.exports = { createPeerCountLcd };
