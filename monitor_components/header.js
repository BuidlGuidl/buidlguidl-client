import blessed from "blessed";
import { debugToFile } from "../helpers.js";
import { execSync } from "child_process";
import axios from "axios";
import { owner } from "../commandLineOptions.js";
import BASE_URL from "../config.js";

export function createHeader(grid, screen, messageForHeader) {
  // New function to fetch points
  async function fetchPoints(owner) {
    try {
      const response = await axios.get(
        `https://${BASE_URL}:48546/yourpoints?owner=${owner}`
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
          `{center}{cyan-fg}Owner: ${owner}{/cyan-fg} | {green-fg}Credits: ${points}{/green-fg}{/center}\n` +
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

  const bigText = grid.set(0, 0, 1, 9, blessed.box, {
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

  updatePointsAndBranchDisplay();
  setInterval(updatePointsAndBranchDisplay, 1 * 60 * 1000); // Every 1 minute

  return { bigText };
}
