const moment = require("moment");

const THAILAND_TIMEZONE = "Asia/Bangkok";
const THAILAND_UTC_OFFSET_MINUTES = 7 * 60;

function getThailandMoment(value = undefined) {
  if (value === undefined || value === null || value === "") {
    return moment().utcOffset(THAILAND_UTC_OFFSET_MINUTES);
  }

  const parsed = moment(value);
  if (!parsed.isValid()) {
    return moment().utcOffset(THAILAND_UTC_OFFSET_MINUTES);
  }

  return parsed.utcOffset(THAILAND_UTC_OFFSET_MINUTES);
}

function getThailandNowDate() {
  return getThailandMoment().toDate();
}

function toThailandDate(value = undefined) {
  return getThailandMoment(value).toDate();
}

function formatThailandDate(value = undefined, format = "YYYY-MM-DD") {
  return getThailandMoment(value).format(format);
}

function formatThailandDateTime(value = undefined, format = "YYYY-MM-DD HH:mm:ss") {
  return getThailandMoment(value).format(format);
}

function formatThailandIso(value = undefined) {
  return getThailandMoment(value).format("YYYY-MM-DDTHH:mm:ss.SSSZ");
}

function getThailandDayRange(value = undefined) {
  const base = getThailandMoment(value);
  return {
    start: base.clone().startOf("day").toDate(),
    end: base.clone().endOf("day").toDate(),
  };
}

module.exports = {
  THAILAND_TIMEZONE,
  THAILAND_UTC_OFFSET_MINUTES,
  getThailandMoment,
  getThailandNowDate,
  toThailandDate,
  formatThailandDate,
  formatThailandDateTime,
  formatThailandIso,
  getThailandDayRange,
};
