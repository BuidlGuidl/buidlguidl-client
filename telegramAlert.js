import axios from "axios";
import { debugToFile } from "./helpers.js";

let TG_ALERT_IDENTIFIER = null;

/**
 * Set the Telegram alert identifier (ENS name or Ethereum address)
 * @param {string} identifier - The ENS name or Ethereum address
 */
export function setTelegramAlertIdentifier(identifier) {
  TG_ALERT_IDENTIFIER = identifier;
}

/**
 * Get the current Telegram alert identifier
 * @returns {string|null} The current telegram alert identifier
 */
export function getTelegramAlertIdentifier() {
  return TG_ALERT_IDENTIFIER;
}

/**
 * Send a Telegram alert via the alert server
 * @param {string} alertType - Type of alert (e.g., 'crash', 'warning', 'info')
 * @param {string} message - The alert message to send
 */
export async function sendTelegramAlert(alertType, message) {
  if (!TG_ALERT_IDENTIFIER) {
    debugToFile("sendTelegramAlert(): No Telegram alert identifier configured");
    return;
  }

  try {
    await axios.post("https://stage.rpc.buidlguidl.com:3000/api/alert", {
      ens: TG_ALERT_IDENTIFIER, // Works with ENS or address
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
