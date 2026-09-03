#!/usr/bin/env node
"use strict";

/**
 * ZKBioTime Attendance Report
 *
 * Employee fields:
 *   first_name = Name
 *   last_name  = Employee ID
 *
 * Features:
 * - Login using ZKBioTime web session + CSRF
 * - Fetch all fingerprint transactions for a day
 * - Handle pagination
 * - Group transactions by employee
 * - First punch = Check In
 * - Last punch = Check Out
 * - Save results to attendance-output.json
 *
 * Usage:
 *
 *   node zkbiotime-report.js
 *
 *   node zkbiotime-report.js 2026-08-26
 *
 * Environment variables:
 *
 *   ZK_HOST
 *   ZK_USER
 *   ZK_PASS
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

/* =========================================================
   CONFIGURATION
========================================================= */

const HOST = process.env.ZK_HOST;
const USERNAME = process.env.ZK_USER;
const PASSWORD = process.env.ZK_PASS;

// Safety limit
const MAX_PAGES = 1000;

// Local output
const OUTPUT_FILE = path.join(
  process.cwd(),
  "attendance-output.json"
);

/* =========================================================
   VALIDATION
========================================================= */

function die(message) {
  console.error(`\n❌ ERROR: ${message}\n`);
  process.exit(1);
}

if (!HOST) {
  die("Missing ZK_HOST environment variable.");
}

if (!USERNAME) {
  die("Missing ZK_USER environment variable.");
}

if (!PASSWORD) {
  die("Missing ZK_PASS environment variable.");
}

/* =========================================================
   COOKIE JAR
========================================================= */

const jar = {};

function absorbCookies(response) {
  const cookies = response.headers["set-cookie"] || [];

  for (const cookie of cookies) {
    const pair = cookie.split(";")[0];

    const index = pair.indexOf("=");

    if (index > 0) {
      const name = pair.slice(0, index);
      const value = pair.slice(index + 1);

      jar[name] = value;
    }
  }
}

function getCookieHeader() {
  return Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

/* =========================================================
   HTTP REQUEST
========================================================= */

function request(method, requestPath, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body || null;
    const extraHeaders = options.headers || {};

    const payload = body
      ? Buffer.from(body, "utf8")
      : null;

    const requestOptions = {
      host: HOST,
      path: requestPath,
      method,

      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) ZKBioTime Attendance Sync",

        ...(payload
          ? {
              "Content-Type":
                "application/x-www-form-urlencoded",

              "Content-Length":
                payload.length,
            }
          : {}),

        ...extraHeaders,
      },
    };

    const req = https.request(
      requestOptions,

      (res) => {
        let raw = "";

        res.setEncoding("utf8");

        res.on("data", (chunk) => {
          raw += chunk;
        });

        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: raw,
          });
        });
      }
    );

    req.on("error", reject);

    if (payload) {
      req.write(payload);
    }

    req.end();
  });
}

/* =========================================================
   LOGIN
========================================================= */

async function login() {
  console.log("🔐 Connecting to ZKBioTime...");
  console.log(`🌐 Host: https://${HOST}`);

  let response = await request(
    "GET",
    "/login/"
  );

  if (response.status !== 200) {
    die(
      `/login/ returned HTTP ${response.status}`
    );
  }

  absorbCookies(response);

  const match = response.body.match(
    /csrfmiddlewaretoken" value="([^"]+)"/
  );

  if (!match) {
    die(
      "Could not find csrfmiddlewaretoken on login page."
    );
  }

  const csrfToken = match[1];

  console.log("✓ Login page loaded");
  console.log("✓ CSRF token found");

  const form =
    `username=${encodeURIComponent(USERNAME)}` +
    `&password=${encodeURIComponent(PASSWORD)}` +
    `&csrfmiddlewaretoken=${encodeURIComponent(
      csrfToken
    )}`;

  response = await request(
    "POST",
    "/login/",
    {
      body: form,

      headers: {
        Cookie: getCookieHeader(),

        Referer: `https://${HOST}/login/`,
      },
    }
  );

  absorbCookies(response);

  let result;

  try {
    result = JSON.parse(response.body);
  } catch (error) {
    die(
      `Unexpected login response.\n` +
        `HTTP: ${response.status}\n` +
        `Response: ${response.body.slice(0, 300)}`
    );
  }

  if (result.ret !== 0) {
    die(
      `Login failed: ${
        result.message || "Unknown error"
      }`
    );
  }

  console.log("✓ Successfully logged in\n");
}

/* =========================================================
   DATE HELPERS
========================================================= */

function pad2(value) {
  return String(value).padStart(2, "0");
}

function getToday() {
  const now = new Date();

  return (
    `${now.getFullYear()}-` +
    `${pad2(now.getMonth() + 1)}-` +
    `${pad2(now.getDate())}`
  );
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isMonthArg(value) {
  return /^\d{4}-\d{2}$/.test(value);
}

function daysInMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function parseMonthArg(argv) {
  // --month 2026-01  |  --month=2026-01  |  YYYY-MM as first positional
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--month" && isMonthArg(argv[i + 1])) return { month: argv[i + 1], out: null, extra: null };
    if (argv[i].startsWith("--month=") && isMonthArg(argv[i].slice(8))) return { month: argv[i].slice(8), out: null, extra: null };
  }
  // allow YYYY-MM as single positional (e.g. node zkbiotime-sync.js 2026-01)
  if (isMonthArg(argv[2])) return { month: argv[2], out: null, extra: null };
  return null;
}

function parseOutArg(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out" && argv[i + 1]) return argv[i + 1];
    if (argv[i].startsWith("--out=")) return argv[i].slice(6);
  }
  return null;
}

/* =========================================================
   FETCH TRANSACTIONS
========================================================= */

async function fetchTransactions(date) {
  console.log(
    `📥 Fetching transactions for ${date}...`
  );

  const allRows = [];

  let totalCount = Infinity;

  let page = 1;

  while (
    allRows.length < totalCount &&
    page <= MAX_PAGES
  ) {
    const startTime =
      `${date} 00:00:00`;

    const endTime =
      `${date} 23:59:59`;

    const requestPath =
      `/iclock/api/transactions/` +
      `?start_time=${encodeURIComponent(startTime)}` +
      `&end_time=${encodeURIComponent(endTime)}` +
      `&page=${page}`;

    console.log(`   Fetching page ${page}...`);

    const response = await request(
      "GET",
      requestPath,
      {
        headers: {
          Cookie: getCookieHeader(),

          Accept: "application/json",

          "X-Requested-With":
            "XMLHttpRequest",
        },
      }
    );

    if (response.status !== 200) {
      die(
        `Transactions API returned HTTP ${response.status}\n` +
          response.body.slice(0, 300)
      );
    }

    let data;

    try {
      data = JSON.parse(response.body);
    } catch (error) {
      die(
        `Invalid JSON from transactions API:\n` +
          response.body.slice(0, 300)
      );
    }

    totalCount =
      typeof data.count === "number"
        ? data.count
        : 0;

    const rows = Array.isArray(data.data)
      ? data.data
      : [];

    console.log(
      `      Received ${rows.length} records`
    );

    allRows.push(...rows);

    if (rows.length === 0) {
      break;
    }

    page += 1;
  }

  if (page > MAX_PAGES) {
    console.warn(
      `⚠️ Reached MAX_PAGES (${MAX_PAGES})`
    );
  }

  console.log(
    `\n✓ Downloaded ${allRows.length} transactions`
  );

  return {
    rows: allRows,
    count: totalCount,
  };
}

/* =========================================================
   TIME HELPERS
========================================================= */

function extractTime(dateTime) {
  if (!dateTime) {
    return null;
  }

  const parts = String(dateTime).split(" ");

  return parts.length > 1
    ? parts[1]
    : String(dateTime);
}

/*
 * In your ZKBioTime system:
 *
 * first_name = Employee Name
 * last_name  = Employee ID
 */

function getEmployeeName(row) {
  return String(
    row.first_name || ""
  ).trim();
}

function getEmployeeId(row) {
  return String(
    row.last_name || ""
  ).trim();
}

/* =========================================================
   GROUP PUNCHES BY EMPLOYEE
========================================================= */

function groupTransactions(rows) {
  const employees = new Map();

  for (const row of rows) {
    const empCode = row.emp_code;

    if (!empCode) {
      console.warn(
        "⚠️ Skipping transaction without emp_code:",
        row
      );

      continue;
    }

    if (!employees.has(empCode)) {
      employees.set(empCode, {
        zk_emp_code: empCode,

        employee_id:
          getEmployeeId(row) || "Unknown",

        name:
          getEmployeeName(row) || "Unknown",

        department:
          row.department || null,

        punches: [],
      });
    }

    const employee =
      employees.get(empCode);

    employee.punches.push({
      zk_transaction_id:
        row.id ||
        row.transaction_id ||
        null,

      punch_time:
        row.punch_time,

      time:
        extractTime(row.punch_time),

      punch_state:
        row.punch_state_display ||
        row.punch_state ||
        "Unknown",

      raw: row,
    });
  }

  // Sort punches by time

  for (const employee of employees.values()) {
    employee.punches.sort(
      (a, b) =>
        String(a.punch_time).localeCompare(
          String(b.punch_time)
        )
    );
  }

  return [...employees.values()];
}

/* =========================================================
   ATTENDANCE CALCULATION
========================================================= */

function calculateAttendance(employee, date) {
  const punches = employee.punches;

  if (!punches.length) {
    return null;
  }

  // First punch = Check In
  const firstPunch = punches[0];

  // Last punch = Check Out
  const lastPunch =
    punches[punches.length - 1];

  const checkIn =
    firstPunch.time;

  // If there is only one punch,
  // we don't know the Check Out time.

  const checkOut =
    punches.length > 1
      ? lastPunch.time
      : null;

  return {
    date,

    employee_id:
      employee.employee_id,

    name:
      employee.name,

    zk_emp_code:
      employee.zk_emp_code,

    department:
      employee.department,

    check_in:
      checkIn,

    check_out:
      checkOut,

    total_punches:
      punches.length,

    punches: punches.map(
      (punch) => ({
        transaction_id:
          punch.zk_transaction_id,

        time:
          punch.punch_time,

        state:
          punch.punch_state,
      })
    ),
  };
}

/* =========================================================
   RENDER TERMINAL TABLE
========================================================= */

function renderTable(attendance) {
  console.log(
    "\n=============================================================="
  );

  console.log(
    "                    ATTENDANCE REPORT"
  );

  console.log(
    "==============================================================\n"
  );

  if (!attendance.length) {
    console.log(
      "No attendance records found."
    );

    return;
  }

  const columns = [
    {
      header: "EMPLOYEE ID",

      value: (row) =>
        String(row.employee_id),
    },

    {
      header: "NAME",

      value: (row) =>
        String(row.name),
    },

    {
      header: "CHECK IN",

      value: (row) =>
        row.check_in || "-",
    },

    {
      header: "CHECK OUT",

      value: (row) =>
        row.check_out || "-",
    },

    {
      header: "PUNCHES",

      value: (row) =>
        String(row.total_punches),
    },
  ];

  const widths = columns.map(
    (column) => {
      return Math.max(
        column.header.length,

        ...attendance.map(
          (row) =>
            String(
              column.value(row)
            ).length
        )
      );
    }
  );

  function line(cells) {
    return cells
      .map((cell, index) =>
        String(cell).padEnd(
          widths[index]
        )
      )
      .join("  ");
  }

  console.log(
    line(
      columns.map(
        (column) => column.header
      )
    )
  );

  console.log(
    widths
      .map((width) =>
        "-".repeat(width)
      )
      .join("  ")
  );

  for (const row of attendance) {
    console.log(
      line(
        columns.map(
          (column) =>
            column.value(row)
        )
      )
    );
  }

  console.log("");
}

/* =========================================================
   SAVE JSON
========================================================= */

function saveOutput(data) {
  const out = parseOutArg(process.argv) || OUTPUT_FILE;
  const dir = path.dirname(out);
  if (dir && dir !== "." && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(out, JSON.stringify(data, null, 2), "utf8");
  console.log(`💾 Results saved to:\n${out}\n`);
}

/* =========================================================
   MAIN
========================================================= */

async function main() {
  const monthArg = parseMonthArg(process.argv);
  if (monthArg) {
    return runMonth(monthArg.month);
  }
  const argument = process.argv[2];

  const date =
    argument &&
    isValidDate(argument)
      ? argument
      : getToday();

  console.log(
    "\n=============================================================="
  );

  console.log(
    " ZKBioTime Attendance Report"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    `Date: ${date}`
  );

  console.log("");

  // Login

  await login();

  // Fetch all fingerprint transactions

  const {
    rows,
    count,
  } = await fetchTransactions(date);

  // Group employees

  const employees =
    groupTransactions(rows);

  // Calculate attendance

  const attendance =
    employees
      .map(
        (employee) =>
          calculateAttendance(
            employee,
            date
          )
      )
      .filter(Boolean)
      .sort(
        (a, b) =>
          a.check_in.localeCompare(
            b.check_in
          )
      );

  // Show table

  renderTable(attendance);

  // Statistics

  const missingCheckoutCount =
    attendance.filter(
      (row) =>
        !row.check_out
    ).length;

  console.log(
    "STATISTICS"
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    `API reported transactions: ${count}`
  );

  console.log(
    `Downloaded transactions: ${rows.length}`
  );

  console.log(
    `Unique employees: ${attendance.length}`
  );

  console.log(
    `Missing check-out: ${missingCheckoutCount}`
  );

  console.log("");

  // Save output

  saveOutput({
    generated_at:
      new Date().toISOString(),

    date,

    statistics: {
      api_transaction_count:
        count,

      downloaded_transactions:
        rows.length,

      unique_employees:
        attendance.length,

      missing_checkouts:
        missingCheckoutCount,
    },

    attendance,
  });

  console.log(
    "✅ REPORT COMPLETED SUCCESSFULLY\n"
  );
}

async function runMonth(ym) {
  const dim = daysInMonth(ym);
  console.log("\n==============================================================");
  console.log(` ZKBioTime Monthly Bundle — ${ym} (31-day sweep)`);
  console.log("==============================================================\n");
  await login();
  const days = {};
  for (let d = 1; d <= dim; d++) {
    const date = `${ym}-${pad2(d)}`;
    const { rows } = await fetchTransactions(date);
    const employees = groupTransactions(rows);
    const attendance = employees
      .map((e) => calculateAttendance(e, date))
      .filter(Boolean)
      .map((a) => ({
        employee_id: a.employee_id,
        name: a.name,
        zk_emp_code: a.zk_emp_code,
        department: a.department,
        // Normalize to HH:MM for parseClockJS; null stays null
        check_in: a.check_in ? a.check_in.slice(0, 5) : null,
        check_out: a.check_out ? a.check_out.slice(0, 5) : null,
        total_punches: a.total_punches,
      }));
    days[date] = attendance;
    console.log(`  · ${date}: ${attendance.length} employees`);
  }
  saveOutput({ month: ym, generated_at: new Date().toISOString(), source: "zkbiotime", days });
  console.log(`\n✅ MONTHLY BUNDLE COMPLETED — ${ym}\n`);
}

async function runEveryFiveMinutes() {
  while (true) {
    try {
      await main();
    } catch (error) {
      console.error("\n❌ ERROR:");
      console.error(error.stack || error.message);
    }

    console.log(
      "⏳ Waiting 5 minutes before the next sync..."
    );

    await new Promise((resolve) =>
      setTimeout(resolve, 5 * 60 * 1000)
    );
  }
}

if (parseMonthArg(process.argv)) {
  main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
} else {
  runEveryFiveMinutes();
}