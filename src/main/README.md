# MSME CashFlow Guard

A web application that helps Indian MSMEs understand their **future cash position**.
Upload a bank-statement CSV and get a data-quality report, historical cash-flow numbers,
a 30-day forecast (conservative / expected / optimistic), a cash-stress level (Low / Medium / High),
a **customer-payment what-if simulator (any delay from 1 to 30 days)** and plain-language recommendations.

| Layer | Technology |
|---|---|
| Backend | Java 17, Spring Boot 3.5, Maven |
| Database | MySQL (managed with MySQL Workbench), Spring Data JPA |
| CSV | Apache Commons CSV |
| Validation | Jakarta Bean Validation |
| Frontend | HTML, CSS, vanilla JavaScript, Chart.js (single page: `index.html`) |
| Tests | JUnit 5 + Mockito |

> The forecast is an **estimate, never a guarantee**, and the validation report is **not a fraud check**.

---

## 1. Project structure

```
msme-cashflow-guard/
├── pom.xml
├── Dockerfile
├── database/schema.sql                      <- run this in MySQL Workbench
├── samples/                                 <- two CSV files to try the app
├── src/main/resources/
│   ├── application.properties               <- local config (env-variable based, no secrets)
│   ├── application-prod.properties          <- production config
│   ├── application-local.properties.example <- copy -> application-local.properties
│   └── static/index.html                    <- YOUR frontend (served by Spring Boot)
└── src/main/java/com/msme/cashflowguard/
    ├── CashFlowGuardApplication.java
    ├── controller/   HTTP only:   Auth, Statement, Dashboard, Forecast, Stress,
    │                              Simulation, Recommendation, BusinessDetails, Health
    ├── service/      business logic: CsvParser, Validation, Classification, CashFlowAnalysis,
    │                 RecurringTransaction, Forecast, StressScore, WhatIfSimulation,
    │                 Recommendation, Statement, Auth, BusinessDetail, StatementData
    ├── repository/   Spring Data JPA interfaces (the only layer that talks to MySQL)
    ├── entity/       AppUser, BankStatement, Transaction, RecurringTransaction, BusinessDetail
    ├── model/        enums (TransactionCategory, StressLevel, Frequency...) + internal records
    ├── dto/          request/response objects the frontend sends and receives
    ├── exception/    GlobalExceptionHandler + typed exceptions
    ├── config/       Clock, BCrypt, login interceptor
    └── util/         BigDecimal money helpers, cash-flow maths, party-name extractor
```

Architecture: `Controller -> Service -> Repository -> MySQL`. Controllers never contain business
logic or SQL, services use constructor injection, money is `BigDecimal`, transaction dates are
`LocalDate`, upload timestamps are `LocalDateTime`, enums are stored as `EnumType.STRING`.

---

## 2. Run it on your computer

### Step 1 - install
* **JDK 17 or 21** (check: `java -version`)
* **Maven 3.9+** (check: `mvn -version`)
* **MySQL Server + MySQL Workbench**

### Step 2 - create the database (MySQL Workbench)
1. Open Workbench and connect to your local MySQL (usually `root` @ `localhost:3306`).
2. **File > Open SQL Script...** and choose `database/schema.sql`.
3. Click the lightning-bolt button. You will now see the schema `msme_cashflow_guard` with 6 tables
   (right-click *Schemas > Refresh All* if you do not see it).

### Step 3 - give the app your MySQL password (never write it in code)
Option A (recommended): copy `src/main/resources/application-local.properties` to
`src/main/resources/application-local.properties`, put your password inside, then run:

```bash
mvn spring-boot:run -Dspring-boot.run.profiles=local
```

Option B: environment variables.

```powershell
# Windows PowerShell
$env:DB_PASSWORD="your-mysql-password"
mvn spring-boot:run
```
```bash
# macOS / Linux
export DB_PASSWORD="your-mysql-password"
mvn spring-boot:run
```

### Step 4 - open the website
Go to **http://localhost:8080**, click *Register*, then login and upload
`samples/sample-healthy-statement.csv` (LOW stress) or `samples/sample-tight-cash-statement.csv` (HIGH stress).

> The sample files end on 10 Oct 2026. If you open them much later the app will (correctly) tell you
> the statement is old and lower the forecast confidence.

### Compile / test / package
```bash
mvn clean compile        # compile
mvn test                 # unit tests (no MySQL needed)
mvn clean package        # builds target/msme-cashflow-guard.jar
java -jar target/msme-cashflow-guard.jar
```

---

## 3. CSV format

First line must be exactly these column names (any capital letters are fine):

```
date,description,debit,credit,balance
01/04/2026,UPI SETTLEMENT PHONEPE POS,,11652,361652
01/04/2026,SALARY APR 2026,140000,,221652
```

* Dates: `dd/MM/yyyy` (Indian order), `yyyy-MM-dd`, `dd-MM-yyyy`, `5-Mar-2026`, `dd/MM/yy`.
* Amounts: commas, `₹`, `Rs` and a trailing `Cr`/`Dr` on balances are accepted. Each row has a debit **or** a credit.
* Newest-first files are re-ordered automatically.
* Max 10 MB, 50,000 rows. Rows that fail validation are reported and **not saved**.
* At least ~90 days of history is recommended.

---

## 4. REST API (what the frontend calls)

All `/api/**` routes except auth and health need a login (server session cookie).

| Method | URL | Purpose |
|---|---|---|
| POST | `/api/auth/register` | create account |
| POST | `/api/auth/login` / `logout`, GET `/api/auth/me` | session |
| POST | `/api/statements/upload` | multipart field `file` -> validation report, preview, customers |
| GET | `/api/dashboard/{id}` | historical cash-flow metrics, top customers/expenses, recurring payments |
| GET | `/api/forecast/{id}` | 30-day forecast, 3 scenarios, assumptions, confidence |
| GET | `/api/stress/{id}` | score /100 (buffer 40 + low-balance days 30 + trend 30), reasons |
| POST | `/api/simulation` | `{statementId, customerName, delayDays 1-30, paymentAmount}` |
| GET | `/api/recommendations/{id}` | recommendations |
| POST/GET | `/api/business-details` | optional rent, fixed costs, cash in hand, upcoming payments |
| DELETE | `/api/statements/{id}` | delete uploaded data |
| GET | `/api/health` | health check for hosting |

Errors are always JSON: `{ "status": 400, "error": "...", "message": "Delay must be a whole number from 1 to 30." }`.

### How the numbers are calculated (so you can explain them)
* **Low-balance day** = closing balance below 7 days of average spending.
* **Forecast** (each of the next 30 days): `Projected Balance = Previous Balance + Expected Inflows - Expected Outflows`.
  Expected flows = detected recurring payments on their dates + the historical daily average of everything non-recurring.
  Conservative/optimistic scenarios change those amounts by fixed percentages (listed in the response `assumptions`).
* **Stress**: 70-100 LOW, 40-69 MEDIUM, 0-39 HIGH.
* **Simulation**: forecast is run twice (payment on its usual date vs. shifted by N days); minimum balance,
  shortage-risk days and stress level are recalculated and compared.
* **Recurring** needs repeated dates at a regular interval and similar amounts; weak evidence is not marked recurring.
* **Classification** is keyword + direction + repeated-pattern based; weak evidence stays `UNKNOWN`.

---

## 4b. Frontend changes made to your `index.html`
Only the wiring - no design change: the API route list in `CONFIG.api` (forecast, stress, recommendations,
delete, business-details, login, register), `statementId` added to the simulation request, a server
logout call, and a "session ended" message when the server answers 401.

---

## 5. Deployment (free / student tier)

1. **Push to GitHub** (no secrets are in the repo; `.gitignore` already excludes them):
   ```bash
   git init && git add . && git commit -m "MSME CashFlow Guard"
   git branch -M main && git remote add origin https://github.com/<you>/msme-cashflow-guard.git && git push -u origin main
   ```
2. **Production MySQL**: create a free/cheap managed MySQL (for example Aiven, Railway or Clever Cloud).
   Connect to it from MySQL Workbench (new connection with the host/port/user/password the provider shows)
   and run `database/schema.sql` once (remove the first two lines if your provider already gave you a database name).
3. **Backend host** (for example Render or Railway) - create a *Web Service* from your GitHub repo:
   * Build command: `mvn clean package -DskipTests`
   * Start command: `java -jar target/msme-cashflow-guard.jar`
   * Or use the included `Dockerfile` (the platform then needs no build/start command).
4. **Environment variables** on the host:

   | Variable | Example |
   |---|---|
   | `SPRING_PROFILES_ACTIVE` | `prod` |
   | `DB_URL` | `jdbc:mysql://HOST:PORT/DBNAME?useSSL=true&serverTimezone=Asia/Kolkata&characterEncoding=UTF-8` |
   | `DB_USERNAME` | from your provider |
   | `DB_PASSWORD` | from your provider |
   | `PORT` | set automatically by most hosts (the app uses `${PORT:8080}`) |
   | `DDL_AUTO` | `update` (default) |

   Health check path: `/api/health`.
5. **Test the public URL**: open it, register, upload a sample CSV, check dashboard, forecast, simulation, delete.

Frontend files are served from the same Spring Boot app (`static/index.html`), so there is no separate frontend deployment and no CORS setup.

### Free-tier limitations to expect
* Free web services **sleep after inactivity**; the first request can take 30-60 s.
* Free/low-tier databases may have small storage, connection limits or expire - keep a backup of `schema.sql` and export data you care about.
* Some hosts' disks are temporary - this app stores nothing on disk (uploads are parsed in memory).

### Security checklist
- [x] Passwords stored as BCrypt hashes; no passwords in source code or Git.
- [x] Every statement is tied to its owner; other users get "not found".
- [x] Session cookie is HttpOnly + SameSite=Lax (+ Secure in production over HTTPS).
- [x] All input validated; uploads limited to 10 MB `.csv`; global JSON error handler hides stack traces.
- [ ] You: use a strong DB password, enable SSL to the DB, serve only over HTTPS.
- [ ] You: add login rate-limiting / CAPTCHA before opening the app to the public internet.

---

## 6. Troubleshooting

| Problem | Fix |
|---|---|
| `Access denied for user 'root'` | wrong `DB_PASSWORD` - set it (Step 3) |
| `Unknown database 'msme_cashflow_guard'` | run `database/schema.sql` in Workbench first |
| `Communications link failure` | MySQL service is not running, or wrong host/port in `DB_URL` |
| `Port 8080 already in use` | `set PORT=9090` (or stop the other program) |
| Upload says "Missing required column(s)" | first line must be `date,description,debit,credit,balance` |
| Upload rejected as 413 / too large | file is over 10 MB - export a shorter period |
| Browser shows "session has ended" | login again (sessions last 8 hours) |
| Everything works locally but not online | check `DB_URL`, `COOKIE_SECURE` (needs HTTPS), and the host log |
