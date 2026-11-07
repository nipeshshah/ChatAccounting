/* ============================================================================
   config.js  -  the only file you edit per environment.
   ----------------------------------------------------------------------------
   apiBaseUrl      Where the .NET API lives (no trailing slash).
                   Local Visual Studio default: https://localhost:7100
   googleClientId  OAuth "Web application" client id from Google Cloud Console.
                   Leave EMPTY to use the API's dev login (only works when the API
                   runs in Development with Auth:AllowDevLogin = true).
   ============================================================================ */
window.APP_CONFIG = {
  apiBaseUrl: "https://localhost:7100",
  googleClientId: ""
};
