// lib/bricklink.js
// A small client for the BrickLink Store API.
// Handles the OAuth 1.0a signing so the rest of the app can just call
// simple functions like getOrders("in"). Credentials come from the
// database (set via the in-app Setup screen) instead of environment
// variables, so this works out of the box in the packaged desktop app.

import OAuth from "oauth-1.0a";
import crypto from "crypto";
import { getSettings } from "@/lib/settings";

async function getOAuthClient() {
  const settings = await getSettings();
  return {
    oauth: OAuth({
      consumer: { key: settings.consumerKey, secret: settings.consumerSecret },
      signature_method: "HMAC-SHA1",
      hash_function(baseString, key) {
        return crypto.createHmac("sha1", key).update(baseString).digest("base64");
      },
    }),
    token: { key: settings.tokenValue, secret: settings.tokenSecret },
  };
}

// Fetches orders for a direction ("in" = sales/income, "out" = purchases/expenses).
export async function fetchOrders(direction = "in") {
  const { oauth, token } = await getOAuthClient();

  const url = `https://api.bricklink.com/api/store/v1/orders?direction=${direction}`;
  const requestData = { url, method: "GET" };
  const authHeader = oauth.toHeader(oauth.authorize(requestData, token));

  const response = await fetch(url, { method: "GET", headers: { ...authHeader } });
  const json = await response.json();

  if (json.meta?.code !== 200) {
    throw new Error(`BrickLink API error (${direction}): ${JSON.stringify(json.meta)}`);
  }

  return json.data; // array of order objects
}

// Fetches FULL detail for one order (shipping/tax/address) - not currently
// used by sync (dropped for speed), kept here in case it's wanted later.
export async function fetchOrderDetail(orderId) {
  const { oauth, token } = await getOAuthClient();

  const url = `https://api.bricklink.com/api/store/v1/orders/${orderId}`;
  const requestData = { url, method: "GET" };
  const authHeader = oauth.toHeader(oauth.authorize(requestData, token));

  const response = await fetch(url, { method: "GET", headers: { ...authHeader } });
  const json = await response.json();

  if (json.meta?.code !== 200) {
    throw new Error(`BrickLink API error (order ${orderId} detail): ${JSON.stringify(json.meta)}`);
  }

  return json.data;
}

// Quick credential check - tries fetching 1 page of orders to confirm the
// keys actually work, used by the Setup screen before saving.
export async function testCredentials() {
  await fetchOrders("in");
  return true;
}
