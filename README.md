# 📅 Private MEGA Calendar

A privacy-focused, serverless calendar that runs entirely in your browser.

### 🔗 [Click here to open the Calendar](https://jobellet.github.io/calendar/)

## 📖 About
This project provides a fully functional calendar (similar to Google Calendar) that respects your privacy. Instead of storing your schedule on a corporate server where it can be scanned, this application uses **client-side encryption**.

It connects directly to your **MEGA.nz** account. Your calendar data is encrypted on your device *before* it is saved to your cloud storage. GitHub Pages hosts the interface, but it never sees your password or your data.

## ✨ Features
* **100% Private**: Data is encrypted/decrypted in your browser.
* **Cloud Sync**: Changes made on one device instantly sync to your MEGA account, making them available everywhere.
* **Categories**: Organize events by Work, Personal, Family, or Urgent (Color-coded).
* **Zero-Setup**: No database configuration or API keys required.
* **Free**: Hosted for free on GitHub Pages and uses the free tier of MEGA.nz.

---

## 🛠️ Setup Instructions

To use this calendar, you simply need a free storage account to save your data.

### Step 1: Create a MEGA.nz Account
If you don't have one already, you need a MEGA account to act as your "backend" database.

1.  Go to **[MEGA.nz/register](https://mega.nz/register)**.
2.  Create a **Free** account (the free tier provides more than enough space for millions of calendar events).
3.  Verify your email address to activate the account.

> **Tip:** You can use your main MEGA account, or create a dedicated free account just for this calendar if you prefer to keep things separate.

### Step 2: "Link" the Account
There is no complex API setup or "linking" process. The calendar works like a standard app:

1.  Open the **[Live Calendar Page](https://jobellet.github.io/calendar/)**.
2.  Enter your **MEGA email** and **password**.
3.  Click **Login & Sync**.

*Note: The first login might take a few seconds as the app generates your encryption keys.*

### Step 3: Start Planning
* **Click on a date** to add an event.
* **Select a category** (Work, Personal, etc.) to color-code the event.
* **Drag and drop** events to reschedule them.

The application will automatically create a file named `calendar_data_v2.json` in the root of your MEGA Cloud Drive. **Do not delete this file**, or you will lose your calendar events.

---

## 🔒 Security & Privacy
* **Client-Side Code**: The code runs entirely in your browser using the open-source `megajs` library.
* **No Middleman**: Your credentials and data are sent directly to MEGA's API. They are never sent to or stored by GitHub.
* **Encryption**: Because MEGA uses Zero-Knowledge encryption, not even MEGA can read your calendar events.

## ⚠️ Requirements
* **Two-Factor Authentication (2FA)**: Currently, this simple web client works best with accounts that rely on a standard Email/Password login. If you have 2FA enabled on your MEGA account, the login may fail. It is recommended to use an account without 2FA for this specific tool.

---

*Project hosted on GitHub.*
