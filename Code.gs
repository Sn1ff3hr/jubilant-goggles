/**
 * A Google Apps Script to be deployed as a Web App. It receives order data from a
 * Cloudflare Worker, authenticates the request, and writes the data to a Google Sheet.
 *
 * --- SETUP ---
 * 1. Create a new Google Sheet to store the order data.
 * 2. Note down the Sheet ID from its URL (e.g., the long string in
 *    https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit)
 * 3. In the Sheet, go to Extensions -> Apps Script.
 * 4. Paste this entire script into the `Code.gs` file, replacing any existing content.
 * 5. Go to Project Settings (the gear icon on the left) -> Script Properties.
 * 6. Add two script properties:
 *    - Property 1:
 *      - Property: SECRET_KEY_FROM_WORKER
 *      - Value: The secret bearer token that your Cloudflare Worker will send. This
 *               must match the 'SECRET_KEY_TO_APPS_SCRIPT' value in the worker.
 *    - Property 2:
 *      - Property: SHEET_ID
 *      - Value: The ID of your Google Sheet from step 2.
 * 7. Deploy the script:
 *    - Click "Deploy" -> "New deployment".
 *    - Select Type: "Web app".
 *    - Description: "Order API".
 *    - Execute as: "Me".
 *    - Who has access: "Anyone" (It's protected by your secret key).
 *    - Click "Deploy".
 *    - Authorize the script's permissions when prompted.
 *    - Copy the "Web app URL". This is the URL you will set as 'APPS_SCRIPT_URL'
 *      in your Cloudflare Worker's environment variables.
 */

// Handles HTTP POST requests
function doPost(e) {
  const properties = PropertiesService.getScriptProperties();
  const SECRET_KEY = properties.getProperty('SECRET_KEY_FROM_WORKER');
  const SHEET_ID = properties.getProperty('SHEET_ID');

  // 1. Authenticate the request from the Cloudflare Worker
  const authHeader = e.parameters.authorization || (e.headers && e.headers.Authorization) || (e.headers && e.headers.authorization);
  const expectedAuth = `Bearer ${SECRET_KEY}`;

  // Note: Apps Script lowercases header names.
  if (!authHeader || authHeader !== expectedAuth) {
    return createJsonResponse({ success: false, message: 'Forbidden' }, 403);
  }

  if (!SHEET_ID) {
    return createJsonResponse({ success: false, message: 'Apps Script is not configured correctly. SHEET_ID is missing.' }, 500);
  }

  try {
    // 2. Get the data and write to the Google Sheet
    const data = JSON.parse(e.postData.contents);

    // Assumes the target sheet is the first sheet in the spreadsheet.
    // Change 'Sheet1' if your sheet has a different name.
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Sheet1');

    // Create a header row if the sheet is empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Timestamp', 'Item', 'Quantity', 'Subtotal', 'VAT', 'Total']);
    }

    // Append a row for each item in the payload
    data.forEach(item => {
      sheet.appendRow([
        item.timestamp,
        item.item,
        item.qty,
        item.subtotal,
        item.vat,
        item.total
      ]);
    });

    // 3. Return a success response
    return createJsonResponse({ success: true, message: 'Order successfully recorded.' });

  } catch (error) {
    // Return an error response
    return createJsonResponse({ success: false, message: `Error processing request: ${error.message}` }, 500);
  }
}

// Helper function to create a JSON response with a given status code
function createJsonResponse(data, statusCode = 200) {
  const output = JSON.stringify(data);
  const textOutput = ContentService.createTextOutput(output).setMimeType(ContentService.MimeType.JSON);
  // Note: Google Apps Script does not directly support setting HTTP status codes
  // in the way standard servers do. The client (worker) will rely on the success
  // property in the JSON body. We return the object for clarity.
  return textOutput;
}
