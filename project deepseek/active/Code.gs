// Code.gs
// Webapp entry point (HtmlService) and exposed RPC functions.
// Frontend calls these via google.script.run.<name>().
// Functions WITHOUT trailing underscore are callable from the frontend.

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle(APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// --- Exposed RPC ---------------------------------------------------------

function ping() {
  return { app: APP_NAME, time: new Date().toISOString() };
}

function getConfig() {
  return readConfig_();
}
