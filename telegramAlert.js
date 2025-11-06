import axios from "axios";
import { debugToFile } from "./helpers.js";

// Get alert server URL from environment variable with fallback
const ALERT_SERVER = "http://stage.rpc.buidlguidl.com:3000";

let TG_ALERT_TOKEN = null;

/**
 * Set the Telegram alert token
 * @param {string} token - The telegram alert token
 */
export function setTelegramAlertToken(token) {
  TG_ALERT_TOKEN = token;
}

/**
 * Get the current Telegram alert token
 * @returns {string|null} The current telegram alert token
 */
export function getTelegramAlertToken() {
  return TG_ALERT_TOKEN;
}

/**
 * Send a Telegram alert via the alert server
 * @param {string} alertType - Type of alert (e.g., 'client_crash', 'warning', 'info')
 * @param {string} message - The alert message to send
 */
export async function sendTelegramAlert(alertType, message) {
  if (!TG_ALERT_TOKEN) {
    debugToFile("sendTelegramAlert(): No Telegram alert token configured");
    return;
  }

  try {
    await axios.post(`${ALERT_SERVER}/api/alert`, {
      token: TG_ALERT_TOKEN,
      message: message,
      alertType: alertType,
    });
    debugToFile(
      `sendTelegramAlert(): Telegram alert sent successfully - Type: ${alertType}`
    );
  } catch (error) {
    debugToFile(
      `sendTelegramAlert(): Failed to send Telegram alert - ${error.message}`
    );
  }
}
