# Chat Accountant - PWA + ASP.NET Core 8 API

```
ChatAccountant.sln
|-- ChatAccountant.Api/     ASP.NET Core 8 Web API + EF Core (SQL Server) + JWT
|   |-- Controllers/        Auth, Config, Ledger, Shares, Profiles, Account
|   |-- Models/             Entities + DTOs     Data/ AppDbContext     Services/ token, Google, OTP, mapper
|-- ChatAccountant.Web/     ASP.NET Core 8 static host for the PWA (everything lives in wwwroot/)
|   |-- wwwroot/index.html, manifest.webmanifest, service-worker.js
|   |-- wwwroot/js/         config.js, database_api.js, panel.js, pwa.js, 01-state.js ... 19-boot.js
|   |-- wwwroot/css/        tailwind.css (compiled), app.css      wwwroot/lib/  jQuery, jsPDF, html2canvas, icons, fonts (self-hosted)
|   |-- tailwind/           Tailwind source (only needed if you change CSS classes)
|-- Database/schema.sql     optional hand-run SQL script
```

## Run it (Visual Studio 2022, .NET 8 SDK)
1. Open `ChatAccountant.sln`.
2. Right-click the solution > **Configure Startup Projects** > **Multiple startup projects** > set **Api** and **Web** to *Start*.
3. Press F5. API: https://localhost:7100 (Swagger at /swagger). PWA: https://localhost:7200.
4. The API creates the `ChatAccountant` database on **(localdb)\MSSQLLocalDB** on first start.
5. In Development, with `googleClientId` empty in `wwwroot/js/config.js`, **Continue with Google** signs in a demo user.
   The phone verification code is **123456** (the API also logs it).

## Real Google sign-in
1. Google Cloud Console > Credentials > OAuth client ID > *Web application*.
   Authorized JavaScript origins: `https://localhost:7200` (and your production PWA URL).
2. Put the client id in `ChatAccountant.Web/wwwroot/js/config.js` (`googleClientId`) **and** in API `Google:ClientId`.

## Settings you must change for production
| Where | Setting |
|---|---|
| API `Jwt:Key` | long random secret (use User Secrets / environment variable, never commit it) |
| API `ConnectionStrings:Default` | your SQL Server |
| API `Cors:Origins` | the PWA's public https origin |
| API `Auth:AllowDevLogin` | keep **false** (it is already ignored outside Development) |
| API `Database:AutoCreate` | `false`, then use EF migrations (`Add-Migration Initial`, `Update-Database`) or `Database/schema.sql` |
| Web `wwwroot/js/config.js` | `apiBaseUrl` = public API URL |
| Web `wwwroot/service-worker.js` | bump `VERSION` on every front-end deploy |
| API `IOtpSender` (Services/Notifiers.cs) | implement with an SMS provider (Twilio, MSG91...). India needs DLT-registered templates |

PWA install needs HTTPS (localhost is fine for testing).

## Changing styles
Tailwind is compiled, not loaded from a CDN (so the app works offline). After adding new classes:
`cd ChatAccountant.Web/tailwind && npm install && npm run build:css`.

## API summary
`POST /api/auth/google|dev`, `GET /api/auth/me`, `POST /api/auth/phone/send|verify`,
`GET|PUT /api/config`, `GET|POST /api/ledger`,
`DELETE /api/ledger/{id}` (Undo), `POST /api/shares`, `GET /api/shares/incoming|outgoing`, `POST /api/shares/{id}/respond`, `DELETE /api/shares/{id}` (withdraw a pending request, Undo),
`GET /api/profiles/lookup?phone=`, `DELETE /api/account/data`. Every row is filtered by the user id in the JWT
(this replaces Supabase row-level security).

## Usability features (v1.2)
- **Review before saving** (`js/17-review-undo.js`): every flow ends with a summary card (Save / Edit). Edit re-asks one field only.
- **Undo toast**: 8 seconds after saving. It removes the entry, restores the debtor/creditor balance and withdraws a request that
  was sent to the other party (if they have not answered yet). Needs `DELETE /api/ledger/{id}`; a data provider without
  `ledger.remove` simply shows no Undo (`Panel.supportsUndo`).
- **First-launch set-up wizard** (`js/18-setup-wizard.js`): business profile, GST rates, payment accounts, currency/number format.
  Shown once when no business name / GST rates exist (`setupDone` is saved in the config).
- **Number format**: Indian (1,23,456.00) by default; Settings > Currency & number format switches to International or Plain
  and changes the currency symbol. CSV exports always use plain numbers.
- **Touch targets**: buttons are at least 44px tall (`css/app.css`), body text 13-15px, amount fields use the decimal keypad.
- The ad banner was removed.
