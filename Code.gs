const HEADERS = [
  'id', 'name', 'team', 'company', 'date', 'slot',
  'slotLabel', 'timestamp', 'branch', 'branchId',
  'accountNumber', 'status', 'email'
];

function migrateHeaders() {
  const sheet = getDataSheet();
  if (sheet.getLastRow() === 0) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const userCol = headers.indexOf('user');
  if (userCol === -1) return;
  sheet.getRange(1, userCol + 1).setValue('accountNumber');
  const passCol = headers.indexOf('password');
  if (passCol !== -1) sheet.deleteColumn(passCol + 1);
}

function doGet(e) {
  try {
    const sheet = getDataSheet();
    migrateHeaders();
    ensureHeaders(sheet);
    applyStatusValidation(sheet);
    const bookings = getAllBookings(sheet);
    return respond({ bookings });
  } catch (err) {
    return respond({ error: err.message });
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const sheet = getDataSheet();
    migrateHeaders();
    ensureHeaders(sheet);

    if (payload.action === 'add') {
      const b = payload.booking;
      const row = HEADERS.map(h => {
        if (b[h] === undefined) return '';
        if (h === 'timestamp') return Number(b[h]);
        return String(b[h]);
      });
      sheet.appendRow(row);
      applyStatusValidation(sheet);
      return respond({ success: true });
    }

    if (payload.action === 'update') {
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      const idCol = headers.indexOf('id');
      const statusCol = headers.indexOf('status');
      const accountNumberCol = headers.indexOf('accountNumber');
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][idCol]) === String(payload.id)) {
          if (payload.status !== undefined) {
            sheet.getRange(i + 1, statusCol + 1).setValue(String(payload.status));
          }
          if (payload.accountNumber !== undefined && accountNumberCol !== -1) {
            sheet.getRange(i + 1, accountNumberCol + 1).setValue(String(payload.accountNumber));
          }
          return respond({ success: true });
        }
      }
      return respond({ success: false, error: 'Booking not found' });
    }

    if (payload.action === 'cancel_request') {
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      const idCol = headers.indexOf('id');
      const statusCol = headers.indexOf('status');
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][idCol]) === String(payload.id)) {
          sheet.getRange(i + 1, statusCol + 1).setValue('cancelled');
          return respond({ success: true });
        }
      }
      return respond({ success: false, error: 'Booking not found' });
    }

    return respond({ error: 'Unknown action: ' + payload.action });
  } catch (err) {
    return respond({ error: err.message });
  }
}

function getDataSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
}

function applyStatusValidation(sheet) {
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['confirmed', 'cancel_requested', 'cancelled', 'waitlist'], true)
    .setAllowInvalid(true)
    .build();
  sheet.getRange('L2:L1000').setDataValidation(rule);
}

function ensureHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#7C3AED')
      .setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
}

function isDateObject(v) {
  return v !== null && v !== undefined && typeof v === 'object' && typeof v.getTime === 'function';
}

function getAllBookings(sheet) {
  if (sheet.getLastRow() <= 1) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const tz = Session.getScriptTimeZone();

  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      let v = row[i];
      if (isDateObject(v)) {
        if (h === 'date') {
          v = Utilities.formatDate(v, tz, 'yyyy-MM-dd');
        } else if (h === 'timestamp') {
          v = v.getTime();
        } else {
          v = Utilities.formatDate(v, tz, 'yyyy-MM-dd');
        }
      } else if (h === 'timestamp' && v !== '') {
        v = Number(v);
      }
      obj[h] = v;
    });
    return obj;
  });
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
