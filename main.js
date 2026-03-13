const fs = require("fs");

function parse12HourToSeconds(timeStr) {
    timeStr = timeStr.trim().toLowerCase();
    const [timePart, period] = timeStr.split(" ");
    const [hStr, mStr, sStr] = timePart.split(":");
    let hours = parseInt(hStr, 10);
    const minutes = parseInt(mStr, 10);
    const seconds = parseInt(sStr, 10);

    if (period === "am") {
        if (hours === 12) {
            hours = 0;
        }
    } else if (period === "pm") {
        if (hours !== 12) {
            hours += 12;
        }
    }

    return hours * 3600 + minutes * 60 + seconds;
}

function parseHmsToSeconds(hmsStr) {
    hmsStr = hmsStr.trim();
    const [hStr, mStr, sStr] = hmsStr.split(":");
    const hours = parseInt(hStr, 10);
    const minutes = parseInt(mStr, 10);
    const seconds = parseInt(sStr, 10);
    return hours * 3600 + minutes * 60 + seconds;
}

function formatSecondsToHms(totalSeconds) {
    totalSeconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(totalSeconds / 3600);
    let remaining = totalSeconds - hours * 3600;
    const minutes = Math.floor(remaining / 60);
    remaining = remaining - minutes * 60;
    const seconds = remaining;

    const mm = minutes.toString().padStart(2, "0");
    const ss = seconds.toString().padStart(2, "0");

    return `${hours}:${mm}:${ss}`;
}

function isInEidPeriod(dateStr) {
    const [yearStr, monthStr, dayStr] = dateStr.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);

    return year === 2025 && month === 4 && day >= 10 && day <= 30;
}

function readLines(path) {
    const data = fs.readFileSync(path, { encoding: "utf8" });
    return data.replace(/\r?\n$/, "").split(/\r?\n/);
}

function getDayName(dateStr) {
    const date = new Date(dateStr);
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return days[date.getUTCDay()];
}

// ============================================================
// Function 1: getShiftDuration(startTime, endTime)
// ============================================================
function getShiftDuration(startTime, endTime) {
    const startSec = parse12HourToSeconds(startTime);
    const endSec = parse12HourToSeconds(endTime);
    const durationSec = endSec - startSec;
    return formatSecondsToHms(durationSec);
}

// ============================================================
// Function 2: getIdleTime(startTime, endTime)
// ============================================================
function getIdleTime(startTime, endTime) {
    const startSec = parse12HourToSeconds(startTime);
    const endSec = parse12HourToSeconds(endTime);

    const DELIVERY_START = 8 * 3600;
    const DELIVERY_END = 22 * 3600;

    let idleBefore = 0;
    let idleAfter = 0;

    if (startSec < DELIVERY_START) {
        idleBefore = Math.min(DELIVERY_START, endSec) - startSec;
        if (idleBefore < 0) idleBefore = 0;
    }

    if (endSec > DELIVERY_END) {
        idleAfter = endSec - Math.max(DELIVERY_END, startSec);
        if (idleAfter < 0) idleAfter = 0;
    }

    return formatSecondsToHms(idleBefore + idleAfter);
}

// ============================================================
// Function 3: getActiveTime(shiftDuration, idleTime)
// ============================================================
function getActiveTime(shiftDuration, idleTime) {
    const shiftSec = parseHmsToSeconds(shiftDuration);
    const idleSec = parseHmsToSeconds(idleTime);
    const activeSec = shiftSec - idleSec;
    return formatSecondsToHms(activeSec);
}

// ============================================================
// Function 4: metQuota(date, activeTime)
// ============================================================
function metQuota(date, activeTime) {
    const activeSec = parseHmsToSeconds(activeTime);
    const normalQuotaSec = 8 * 3600 + 24 * 60;
    const eidQuotaSec = 6 * 3600;
    const quota = isInEidPeriod(date) ? eidQuotaSec : normalQuotaSec;
    return activeSec >= quota;
}

// ============================================================
// Function 5: addShiftRecord(textFile, shiftObj)
// ============================================================
function addShiftRecord(textFile, shiftObj) {
    const lines = readLines(textFile);
    const header = lines[0];
    const rows = lines.slice(1);

    for (let i = 0; i < rows.length; i++) {
        const line = rows[i].trim();
        if (!line) continue;
        const parts = line.split(",");
        const id = parts[0];
        const date = parts[2];
        if (id === shiftObj.driverID && date === shiftObj.date) {
            return {};
        }
    }

    const shiftDuration = getShiftDuration(shiftObj.startTime, shiftObj.endTime);
    const idleTime = getIdleTime(shiftObj.startTime, shiftObj.endTime);
    const activeTime = getActiveTime(shiftDuration, idleTime);
    const met = metQuota(shiftObj.date, activeTime);
    const hasBonus = false;

    const recordObj = {
        driverID: shiftObj.driverID,
        driverName: shiftObj.driverName,
        date: shiftObj.date,
        startTime: shiftObj.startTime,
        endTime: shiftObj.endTime,
        shiftDuration: shiftDuration,
        idleTime: idleTime,
        activeTime: activeTime,
        metQuota: met,
        hasBonus: hasBonus
    };

    const newLine = [
        recordObj.driverID,
        recordObj.driverName,
        recordObj.date,
        recordObj.startTime,
        recordObj.endTime,
        recordObj.shiftDuration,
        recordObj.idleTime,
        recordObj.activeTime,
        recordObj.metQuota ? "true" : "false",
        recordObj.hasBonus ? "true" : "false"
    ].join(",");

    let lastIndexForDriver = -1;
    for (let i = 0; i < rows.length; i++) {
        const line = rows[i].trim();
        if (!line) continue;
        const parts = line.split(",");
        if (parts[0] === shiftObj.driverID) {
            lastIndexForDriver = i;
        }
    }

    let insertIndex = rows.length;
    if (lastIndexForDriver !== -1) {
        insertIndex = lastIndexForDriver + 1;
    }

    const newRows = rows.slice(0, insertIndex).concat([newLine], rows.slice(insertIndex));
    const outputLines = [header].concat(newRows);
    fs.writeFileSync(textFile, outputLines.join("\n"), { encoding: "utf8" });

    return recordObj;
}

// ============================================================
// Function 6: setBonus(textFile, driverID, date, newValue)
// ============================================================
function setBonus(textFile, driverID, date, newValue) {
    const lines = readLines(textFile);
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.split(",");
        if (parts[0] === driverID && parts[2] === date) {
            parts[9] = newValue ? "true" : "false";
            lines[i] = parts.join(",");
            break;
        }
    }
    fs.writeFileSync(textFile, lines.join("\n"), { encoding: "utf8" });
}

// ============================================================
// Function 7: countBonusPerMonth(textFile, driverID, month)
// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
    const lines = readLines(textFile);
    const targetMonth = parseInt(month, 10);

    let driverFound = false;
    let count = 0;

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.split(",");
        const id = parts[0];
        if (id === driverID) {
            driverFound = true;
            const date = parts[2];
            const [_, monthStr] = date.split("-");
            const m = parseInt(monthStr, 10);
            const hasBonus = parts[9] === "true";
            if (m === targetMonth && hasBonus) {
                count++;
            }
        }
    }

    if (!driverFound) {
        return -1;
    }

    return count;
}

// ============================================================
// Function 8: getTotalActiveHoursPerMonth(textFile, driverID, month)
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    const lines = readLines(textFile);
    let totalSeconds = 0;

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.split(",");
        const id = parts[0];
        if (id !== driverID) continue;
        const date = parts[2];
        const [yearStr, monthStr] = date.split("-");
        const m = parseInt(monthStr, 10);
        if (m !== month) continue;
        const activeTime = parts[7];
        totalSeconds += parseHmsToSeconds(activeTime);
    }

    return formatSecondsToHms(totalSeconds);
}

// ============================================================
// Function 9: getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month)
// ============================================================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    const shiftLines = readLines(textFile);
    const rateLines = readLines(rateFile);

    let dayOff = null;

    for (let i = 0; i < rateLines.length; i++) {
        const line = rateLines[i].trim();
        if (!line) continue;
        const parts = line.split(",");
        if (parts[0] === driverID) {
            dayOff = parts[1];
            break;
        }
    }

    const normalQuotaSec = 8 * 3600 + 24 * 60;
    const eidQuotaSec = 6 * 3600;
    let totalRequiredSec = 0;

    for (let i = 1; i < shiftLines.length; i++) {
        const line = shiftLines[i].trim();
        if (!line) continue;
        const parts = line.split(",");
        const id = parts[0];
        if (id !== driverID) continue;

        const date = parts[2];
        const [yearStr, monthStr] = date.split("-");
        const m = parseInt(monthStr, 10);
        if (m !== month) continue;

        const dayName = getDayName(date);
        if (dayOff && dayName === dayOff) continue;

        const dailyQuota = isInEidPeriod(date) ? eidQuotaSec : normalQuotaSec;
        totalRequiredSec += dailyQuota;
    }

    totalRequiredSec -= bonusCount * 2 * 3600;
    if (totalRequiredSec < 0) totalRequiredSec = 0;

    return formatSecondsToHms(totalRequiredSec);
}

// ============================================================
// Function 10: getNetPay(driverID, actualHours, requiredHours, rateFile)
// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    const rateLines = readLines(rateFile);

    let basePay = null;
    let tier = null;

    for (let i = 0; i < rateLines.length; i++) {
        const line = rateLines[i].trim();
        if (!line) continue;
        const parts = line.split(",");
        if (parts[0] === driverID) {
            basePay = parseInt(parts[2], 10);
            tier = parseInt(parts[3], 10);
            break;
        }
    }

    if (basePay === null || tier === null) {
        return 0;
    }

    const actualSec = parseHmsToSeconds(actualHours);
    const requiredSec = parseHmsToSeconds(requiredHours);

    if (actualSec >= requiredSec) {
        return basePay;
    }

    let missingSec = requiredSec - actualSec;

    const allowedMissingHoursByTier = {
        1: 50,
        2: 20,
        3: 10,
        4: 3
    };

    const allowedHours = allowedMissingHoursByTier[tier] || 0;
    const allowedSec = allowedHours * 3600;

    if (missingSec <= allowedSec) {
        return basePay;
    }

    missingSec -= allowedSec;
    const billableMissingHours = Math.floor(missingSec / 3600);

    const deductionRatePerHour = Math.floor(basePay / 185);
    const salaryDeduction = billableMissingHours * deductionRatePerHour;
    const netPay = basePay - salaryDeduction;

    return netPay;
}

module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
    setBonus,
    countBonusPerMonth,
    getTotalActiveHoursPerMonth,
    getRequiredHoursPerMonth,
    getNetPay
};
