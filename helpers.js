const fs = require("fs");

function setupDebugLogging(debugLogPath) {
    if (fs.existsSync(debugLogPath)) {
      fs.unlinkSync(debugLogPath);
    }
  
    function logDebug(message) {
      if (typeof message === "object") {
        message = JSON.stringify(message, null, 2);
      }
      fs.appendFileSync(
        debugLogPath,
        `[${new Date().toISOString()}] ${message}\n`
      );
    }
  
    console.log = function (message, ...optionalParams) {
      if (optionalParams.length > 0) {
        message +=
          " " +
          optionalParams
            .map((param) =>
              typeof param === "object" ? JSON.stringify(param, null, 2) : param
            )
            .join(" ");
      }
      logDebug(message);
    };
  }


  module.exports = { setupDebugLogging };
