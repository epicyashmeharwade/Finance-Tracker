// ============================================================
// CONFIG — fill in your own values below. This is the ONLY
// file you should need to edit to get the app running.
// ============================================================

const CONFIG = {
  // Your display name, shown in the time-based greeting
  // (e.g. "Good morning, Yash")
  USER_NAME: "Yash",

  // The API key you created in Google Cloud Console
  API_KEY: "AIzaSyBMWJ7FpVsbMysrlO4LHbpUFRbQfY_35LQ",

  // The long ID from your Google Sheet's URL
  // (the part between /d/ and /edit)
  SHEET_ID: "1CRbnEgvb2J2g0pZtclxpH9x3NlkMn2qD--YiEZ0U0MQ",

  // The sheet tab name and range where your data lives.
  // If your tab is called "Sheet1" and row 1 is headers
  // (Date, Description, Amount, Payment Account, Payment
  // Method, Payment App), leave this as is.
  SHEET_RANGE: "Sheet1!A2:F",

  // Starting ("opening") balance for each bank account, in INR.
  // The app adds up all your transactions on top of these.
  // Set these to whatever each account's balance was on the
  // day BEFORE your very first logged transaction.
  OPENING_BALANCES: {
    "SBI Bank": 6.07,
    "Kotak Mahindra Bank": 11.14,
    "HDFC Bank": -4529.99
  },

  // How often (in seconds) the app refreshes data while open
  REFRESH_SECONDS: 5,

  // How many transactions to load per page on the History tab
  PAGE_SIZE: 20
};
