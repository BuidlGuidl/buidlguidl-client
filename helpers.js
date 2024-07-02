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

  // function getFormattedDateTime() {
    //   const now = new Date();
    
    //   const year = now.getFullYear();
    //   const month = (now.getMonth() + 1).toString().padStart(2, "0");
    //   const day = now.getDate().toString().padStart(2, "0");
    //   const hour = now.getHours().toString().padStart(2, "0");
    //   const minute = now.getMinutes().toString().padStart(2, "0");
    //   const second = now.getSeconds().toString().padStart(2, "0");
    
    //   return `${year}_${month}_${day}_${hour}_${minute}_${second}`;
    // }
    


  module.exports = { setupDebugLogging };
