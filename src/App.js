import { useState, useEffect, useCallback } from "react";
import {
  fetchDebtRecords, saveDebtRecord, updateDebtRecord, deleteDebtRecord,
  fetchCashRecords, saveCashRecord, updateCashRecord, deleteCashRecord,
} from "./supabase";

// ==================== ENGLISH DIGITS HELPERS ====================
const AR_KW_LATN = "ar-KW-u-nu-latn";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

function toEnglishDigits(value) {
  if (value === null || value === undefined) return value;
  return String(value)
    .replace(/[٠-٩]/g, d => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, d => String(PERSIAN_DIGITS.indexOf(d)));
}

function cleanNumber(value) {
  return String(toEnglishDigits(value ?? ""))
    .replace(/,/g, "")
    .replace(/٫/g, ".")
    .replace(/٬/g, "");
}

function toNumber(value) {
  const n = Number.parseFloat(cleanNumber(value));
  return Number.isNaN(n) ? 0 : n;
}

function toInteger(value) {
  const n = Number.parseInt(cleanNumber(value), 10);
  return Number.isNaN(n) ? 0 : n;
}

function fmtLatnNumber(value, options = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return toEnglishDigits(n.toLocaleString(AR_KW_LATN, options));
}

function fmtLatnDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return toEnglishDigits(date.toLocaleDateString(AR_KW_LATN));
}

function normalizeDigitsDeep(value) {
  if (Array.isArray(value)) return value.map(normalizeDigitsDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalizeDigitsDeep(v)]));
  }
  return typeof value === "string" ? toEnglishDigits(value) : value;
}


// ==================== CURRENCY HELPERS ====================
const CURRENCY_OPTIONS = [
  { code: "KWD", name: "دينار كويتي" },
  { code: "USD", name: "دولار أمريكي" },
  { code: "EUR", name: "يورو" },
  { code: "GBP", name: "جنيه إسترليني" },
  { code: "AUD", name: "دولار أسترالي" },
  { code: "CAD", name: "دولار كندي" },
  { code: "NZD", name: "دولار نيوزيلندي" },
  { code: "CHF", name: "فرنك سويسري" },
  { code: "JPY", name: "ين ياباني" },
  { code: "CNY", name: "يوان صيني" },
  { code: "HKD", name: "دولار هونغ كونغ" },
  { code: "SGD", name: "دولار سنغافوري" },
  { code: "MYR", name: "رينغيت ماليزي" },
  { code: "INR", name: "روبية هندية" },
  { code: "PKR", name: "روبية باكستانية" },
  { code: "THB", name: "بات تايلندي" },
  { code: "KRW", name: "وون كوري" },
  { code: "SAR", name: "ريال سعودي" },
  { code: "AED", name: "درهم إماراتي" },
  { code: "QAR", name: "ريال قطري" },
  { code: "BHD", name: "دينار بحريني" },
  { code: "OMR", name: "ريال عماني" },
  { code: "JOD", name: "دينار أردني" },
  { code: "EGP", name: "جنيه مصري" },
  { code: "MAD", name: "درهم مغربي" },
  { code: "TND", name: "دينار تونسي" },
  { code: "TRY", name: "ليرة تركية" },
  { code: "SEK", name: "كرونا سويدية" },
  { code: "NOK", name: "كرونا نرويجية" },
  { code: "DKK", name: "كرونا دنماركية" },
  { code: "ZAR", name: "راند جنوب أفريقي" },
  { code: "OTHER", name: "عملة أخرى" },
];

function getAttacheCurrencyCode(d) {
  const selected = d?.attacheCurrency || "USD";
  if (selected === "OTHER") {
    const custom = toEnglishDigits(d?.attacheCurrencyOther || "").trim().toUpperCase();
    return custom || "OTHER";
  }
  return selected;
}

function getCurrencyName(code) {
  const found = CURRENCY_OPTIONS.find(c => c.code === code);
  return found ? found.name : "عملة أخرى";
}

function getCurrencyDisplay(d) {
  const code = getAttacheCurrencyCode(d);
  if (code === "OTHER") return "عملة أخرى";
  return `${code} - ${getCurrencyName(code)}`;
}

function getEffectiveExchangeRate(d) {
  return getAttacheCurrencyCode(d) === "KWD" ? 1 : (toNumber(d.exchangeRate) || 0);
}

// ==================== CALCULATIONS ====================
function calcDuration(startY, startM, startD, endY, endM, endD) {
  const sy = toInteger(startY) || 0;
  const sm = toInteger(startM) || 0;
  const sd = toInteger(startD) || 0;
  const ey = toInteger(endY) || 0;
  const em = toInteger(endM) || 0;
  const ed = toInteger(endD) || 0;

  if (!sy || !sm || !sd || !ey || !em || !ed) {
    return { days: 0, months: 0, years: 0, total: 0 };
  }

  let days = ed - sd;
  let months = em - sm;
  let years = ey - sy;
  if (days < 0) { days += 30; months -= 1; }
  if (months < 0) { months += 12; years -= 1; }
  if (years < 0) return { days: 0, months: 0, years: 0, total: 0 };

  const total = (years * 12) + months + (days / 30);
  return { days, months, years, total };
}

function durationFromTotalMonths(totalMonths) {
  const safeTotal = Math.max(0, Number(totalMonths) || 0);
  let years = Math.floor(safeTotal / 12);
  let remainder = safeTotal - (years * 12);
  let months = Math.floor(remainder);
  let days = Math.round((remainder - months) * 30);

  if (days >= 30) { days -= 30; months += 1; }
  if (months >= 12) { months -= 12; years += 1; }
  return { years, months, days };
}

function calcDebt(d) {
  const amountDiwan = toNumber(d.amountDiwan) || 0;
  const amountAttache = toNumber(d.amountAttache) || 0;
  const attacheCurrency = getAttacheCurrencyCode(d);
  const attacheCurrencyDisplay = getCurrencyDisplay(d);
  const exchangeRate = getEffectiveExchangeRate(d);
  const attacheAmountKWD = amountAttache * exchangeRate;
  const fullDebtAmount = toNumber(d.fullDebtAmount) || 0;
  const totalKWD = amountDiwan + attacheAmountKWD;

  const missionBase = calcDuration(
    d.missionStartYear, d.missionStartMonth, d.missionStartDay,
    d.missionEndYear, d.missionEndMonth, d.missionEndDay
  );
  const returnMonth = toInteger(d.returnMonth) || 0;
  const missionTotal = Math.max(0, missionBase.total + returnMonth);
  const missionDuration = durationFromTotalMonths(missionTotal);

  const stopBase = calcDuration(
    d.stopStartYear, d.stopStartMonth, d.stopStartDay,
    d.stopEndYear, d.stopEndMonth, d.stopEndDay
  );
  const stopTotal = Math.max(0, stopBase.total);
  const stopDuration = durationFromTotalMonths(stopTotal);

  const serviceBase = calcDuration(
    d.serviceStartYear, d.serviceStartMonth, d.serviceStartDay,
    d.serviceEndYear, d.serviceEndMonth, d.serviceEndDay
  );
  const serviceTotal = Math.max(0, serviceBase.total);
  const serviceDuration = durationFromTotalMonths(serviceTotal);

  const unservedTotal = Math.max(0, missionTotal - stopTotal - serviceTotal);
  const unservedDuration = durationFromTotalMonths(unservedTotal);
  const partialDebt = missionTotal > 0 ? (totalKWD * 0.5 * unservedTotal / missionTotal) : 0;
  const totalDebt = fullDebtAmount + partialDebt;

  return {
    totalKWD, fullDebtAmount, amountDiwan, amountAttache, attacheCurrency, attacheCurrencyDisplay, exchangeRate, attacheAmountKWD,
    missionDays: missionDuration.days, missionMonths: missionDuration.months, missionYears: missionDuration.years, missionTotal,
    stopDays: stopDuration.days, stopMonths: stopDuration.months, stopYears: stopDuration.years, stopTotal,
    serviceDays: serviceDuration.days, serviceMonths: serviceDuration.months, serviceYears: serviceDuration.years, serviceTotal,
    unservedDays: unservedDuration.days, unservedMonths: unservedDuration.months, unservedYears: unservedDuration.years, unservedTotal,
    partialDebt, totalDebt,
  };
}

const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

function getCurrentCalendarYear() {
  return new Date().getFullYear();
}

function getCashCalendarYear(d) {
  return toInteger(d?.cashYear) || getCurrentCalendarYear();
}

function getFiscalYearInfo(calendarYear, monthIndex) {
  const y = toInteger(calendarYear) || getCurrentCalendarYear();
  const startYear = monthIndex >= 3 ? y : y - 1; // السنة المالية تبدأ 1 أبريل وتنتهي 31 مارس
  return {
    startYear,
    endYear: startYear + 1,
    label: `${toEnglishDigits(startYear)}/${toEnglishDigits(startYear + 1)}`,
  };
}

function getMonthMaxDays(monthIndex) {
  return monthIndex === 1 ? 28 : (monthIndex === 3 || monthIndex === 5 || monthIndex === 8 || monthIndex === 10) ? 30 : 31;
}

function calcCash(d) {
  const salary=toNumber(d.salary)||0;
  const calendarYear = getCashCalendarYear(d);
  const days=d.monthDays||Array(12).fill(0);
  let totalDays=0, totalAmount=0;
  const fiscalMap = {};
  const monthAmounts=days.map((di,i)=>{
    const nd=toInteger(di)||0;
    const maxDays=getMonthMaxDays(i);
    totalDays+=nd;
    const amt=nd===0?0:(nd>=maxDays?salary:(salary*nd/maxDays));
    totalAmount+=amt;
    if (nd > 0) {
      const fy = getFiscalYearInfo(calendarYear, i);
      if (!fiscalMap[fy.label]) {
        fiscalMap[fy.label] = { fiscalYear: fy.label, startYear: fy.startYear, months: [], totalDays: 0, totalAmount: 0 };
      }
      fiscalMap[fy.label].months.push(MONTHS_AR[i]);
      fiscalMap[fy.label].totalDays += nd;
      fiscalMap[fy.label].totalAmount += amt;
    }
    return amt;
  });
  const fiscalGroups = Object.values(fiscalMap).sort((a,b)=>a.startYear-b.startYear);
  const deductions=toNumber(d.deductions)||0, custody=toNumber(d.custody)||0;
  return { calendarYear, totalDays, totalAmount, monthAmounts, fiscalGroups, deductions, custody, netDue:totalAmount-deductions-custody };
}

// ==================== COLORS ====================
const C = {
  bg:"#0a0e1a", surface:"#111827", surfaceHover:"#1a2235", border:"#1e293b", borderLight:"#334155",
  accent:"#3b82f6", accentGlow:"rgba(59,130,246,0.15)", gold:"#f59e0b", green:"#10b981", red:"#ef4444",
  textPrimary:"#f1f5f9", textSecondary:"#94a3b8", textMuted:"#475569",
  debt:"#7c3aed", debtLight:"#a78bfa", cash:"#0891b2", cashLight:"#67e8f9",
};

// ==================== PDF ====================
const fmtKWD = n => (!n||isNaN(n))?"—":fmtLatnNumber(n,{minimumFractionDigits:3,maximumFractionDigits:3})+" د.ك";
const fmtDur = (y,m,d) => `${toEnglishDigits(y||0)} سنة  ${toEnglishDigits(m||0)} شهر  ${toEnglishDigits(d||0)} يوم`;

const CSC_LOGO_DATA_URL = "data:image/png;base64,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";
const CSC_WORDMARK_DATA_URL = "data:image/png;base64,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";

function generateDebtPDF(data, result, savedAt) {
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"/>
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Arabic:wght@400;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
@page{size:A4;margin:14mm;}
body{font-family:'IBM Plex Arabic',Arial,sans-serif;direction:rtl;background:#fff;color:#1a202c;padding:22px;}
.header{direction:ltr;display:grid;grid-template-columns:220px 1fr 220px;align-items:center;gap:0;margin-bottom:24px;padding:10px 0 18px;border-bottom:2px solid #e2e8f0;min-height:108px;}
.header-left{grid-column:1;display:flex;justify-content:flex-start;align-items:center;min-width:0;}
.header-left img{max-width:205px;max-height:74px;object-fit:contain;}
.header-main{grid-column:2;text-align:center;direction:rtl;display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:0;padding:0 18px;}
.header-main h1{font-size:25px;font-weight:800;color:#1a202c;margin:0 0 7px;line-height:1.25;white-space:nowrap;}
.header-main .sub{font-size:14px;font-weight:700;color:#475569;margin-top:0;line-height:1.35;white-space:nowrap;}
.header-right{grid-column:3;display:flex;justify-content:flex-end;align-items:center;min-width:0;}
.header-right img{max-width:82px;max-height:82px;object-fit:contain;}
.meta{display:flex;gap:16px;margin-bottom:22px;}
.meta-box{flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:74px;}
.meta-box label{font-size:11px;color:#64748b;font-weight:600;display:block;margin-bottom:6px;text-align:center;width:100%;}
.meta-box span{font-size:15px;font-weight:700;color:#1a202c;display:block;text-align:center;width:100%;}
.section{margin-bottom:20px;}
.section-title{font-size:13px;font-weight:700;color:#7c3aed;border-bottom:2px solid #7c3aed;padding-bottom:6px;margin-bottom:14px;}
table{width:100%;border-collapse:collapse;}
td{padding:9px 14px;font-size:13px;border-bottom:1px solid #f1f5f9;}
td:first-child{color:#64748b;width:55%;} td:last-child{font-weight:600;color:#1a202c;text-align:left;}
.result-box{background:linear-gradient(135deg,#7c3aed18,#7c3aed08);border:2px solid #7c3aed40;border-radius:10px;padding:16px 20px;margin-top:20px;display:flex;justify-content:space-between;align-items:center;}
.result-box .label{font-size:14px;color:#475569;} .result-box .amount{font-size:24px;font-weight:700;color:#7c3aed;}
.footer{margin-top:28px;border-top:1px solid #e2e8f0;padding-top:14px;display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;}
.page-break{break-before:page;page-break-before:always;padding-top:0;}
.signatures{margin-top:34px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px;direction:rtl;}
.sig-box{min-height:86px;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;text-align:center;background:#fff;display:flex;flex-direction:column;justify-content:space-between;}
.sig-title{font-size:13px;font-weight:700;color:#1a202c;}
.sig-line{height:36px;border-bottom:1px dashed #94a3b8;margin:0 10px;}
@media print{body{padding:0;}.page-break{break-before:page;page-break-before:always;}}
</style></head><body>
<div class="header"><div class="header-left"><img src="${CSC_WORDMARK_DATA_URL}" alt="ديوان الخدمة المدنية"/></div><div class="header-main"><h1>نموذج حساب المديونية</h1><div class="sub">ديوان الخدمة المدنية - إدارة الشئون المالية</div></div><div class="header-right"><img src="${CSC_LOGO_DATA_URL}" alt="شعار ديوان الخدمة المدنية"/></div></div>
<div class="meta">
  <div class="meta-box"><label>الاسم الكامل</label><span>${data.name||"—"}</span></div>
  <div class="meta-box"><label>الرقم المدني</label><span>${data.civilId||"—"}</span></div>
  <div class="meta-box"><label>تاريخ الإصدار</label><span>${savedAt||fmtLatnDate()}</span></div>
</div>
<div class="section"><div class="section-title">المبالغ المالية</div>
<table>
  <tr><td>مبالغ صرفت عن طريق الديوان</td><td>${fmtKWD(toNumber(data.amountDiwan)||0)}</td></tr>
  <tr><td>عملة الملحق الثقافي</td><td>${result.attacheCurrencyDisplay || getCurrencyDisplay(data)}</td></tr>
  <tr><td>مبالغ صرفت عن طريق الملحق الثقافي</td><td>${fmtLatnNumber(toNumber(data.amountAttache)||0,{minimumFractionDigits:3,maximumFractionDigits:3})} ${result.attacheCurrency || getAttacheCurrencyCode(data)}</td></tr>
  <tr><td>سعر الصرف مقابل الدينار الكويتي</td><td>${fmtLatnNumber(result.exchangeRate,{minimumFractionDigits:6,maximumFractionDigits:6})}</td></tr>
  <tr><td>يعادل بالدينار الكويتي</td><td>${fmtKWD(result.attacheAmountKWD)}</td></tr>
  <tr><td><strong>إجمالي المبلغ بالدينار الكويتي</strong></td><td><strong>${fmtKWD(result.totalKWD)}</strong></td></tr>
  <tr><td>المستحق 100%</td><td>${fmtKWD(result.fullDebtAmount)}</td></tr>
</table></div>
<div class="section"><div class="section-title">فترة البعثة</div>
<table>
  <tr><td>بداية البعثة</td><td>${data.missionStartDay||0}/${data.missionStartMonth||0}/${data.missionStartYear||0}</td></tr>
  <tr><td>نهاية البعثة</td><td>${data.missionEndDay||0}/${data.missionEndMonth||0}/${data.missionEndYear||0}</td></tr>
  <tr><td>شهر العودة</td><td>${data.returnMonth||0} شهر</td></tr>
  <tr><td><strong>مدة البعثة الإجمالية</strong></td><td><strong>${fmtDur(result.missionYears,result.missionMonths,result.missionDays)} — ${fmtLatnNumber(result.missionTotal,{minimumFractionDigits:3,maximumFractionDigits:3})} شهر</strong></td></tr>
</table></div>
<div class="section"><div class="section-title">فترة الوقف</div>
<table>
  <tr><td>بداية الوقف</td><td>${data.stopStartDay||0}/${data.stopStartMonth||0}/${data.stopStartYear||0}</td></tr>
  <tr><td>نهاية الوقف</td><td>${data.stopEndDay||0}/${data.stopEndMonth||0}/${data.stopEndYear||0}</td></tr>
  <tr><td><strong>مدة الوقف</strong></td><td><strong>${fmtDur(result.stopYears,result.stopMonths,result.stopDays)} — ${fmtLatnNumber(result.stopTotal,{minimumFractionDigits:3,maximumFractionDigits:3})} شهر</strong></td></tr>
</table></div>
<div class="section page-break"><div class="section-title">فترة الخدمة</div>
<table>
  <tr><td>تاريخ مباشر العمل</td><td>${data.serviceStartDay||0}/${data.serviceStartMonth||0}/${data.serviceStartYear||0}</td></tr>
  <tr><td>تاريخ الاستقالة / نهاية الخدمة</td><td>${data.serviceEndDay||0}/${data.serviceEndMonth||0}/${data.serviceEndYear||0}</td></tr>
  <tr><td><strong>مدة الخدمة الإجمالية</strong></td><td><strong>${fmtDur(result.serviceYears,result.serviceMonths,result.serviceDays)} — ${fmtLatnNumber(result.serviceTotal,{minimumFractionDigits:3,maximumFractionDigits:3})} شهر</strong></td></tr>
</table></div>
<div class="section"><div class="section-title">تفاصيل المديونية</div>
<table>
  <tr><td>مدة البعثة</td><td>${fmtDur(result.missionYears,result.missionMonths,result.missionDays)}</td></tr>
  <tr><td>مدة الوقف</td><td>${fmtDur(result.stopYears,result.stopMonths,result.stopDays)}</td></tr>
  <tr><td>مدة الخدمة</td><td>${fmtDur(result.serviceYears,result.serviceMonths,result.serviceDays)}</td></tr>
  <tr><td>المدة التي لم يخدم مقابلها</td><td>${fmtDur(result.unservedYears,result.unservedMonths,result.unservedDays)} — ${fmtLatnNumber(result.unservedTotal,{minimumFractionDigits:3,maximumFractionDigits:3})} شهر</td></tr>
  <tr><td>معادلة المستحق 50%</td><td>${fmtKWD(result.totalKWD)} × 50% × ${fmtLatnNumber(result.unservedTotal,{minimumFractionDigits:3,maximumFractionDigits:3})} / ${fmtLatnNumber(result.missionTotal,{minimumFractionDigits:3,maximumFractionDigits:3})}</td></tr>
  <tr><td>المستحق 50%</td><td>${fmtKWD(result.partialDebt)}</td></tr>
  <tr><td>المستحق 100%</td><td>${fmtKWD(result.fullDebtAmount)}</td></tr>
</table>
<div class="result-box"><span class="label">إجمالي المديونية بعد تطبيق المادة (33)</span><span class="amount">${fmtKWD(result.totalDebt)}</span></div>
</div>
<div class="signatures">
  <div class="sig-box"><div class="sig-title">معد النموذج</div><div class="sig-line"></div></div>
  <div class="sig-box"><div class="sig-title">رئيس القسم</div><div class="sig-line"></div></div>
  <div class="sig-box"><div class="sig-title">المراجعة</div><div class="sig-line"></div></div>
</div>
<div class="footer"><span>نظام الحسابات المالية — ديوان الخدمة المدنية</span><span>تاريخ الطباعة: ${fmtLatnDate()}</span></div>
</body></html>`;
}

function generateCashPDF(data, result, savedAt) {
  // إعادة حساب نتيجة البدل النقدي وقت الطباعة لضمان ظهور تجميع السنة المالية
  // حتى للسجلات القديمة المحفوظة قبل إضافة خاصية التجميع.
  const recalculatedResult = calcCash(data || {});
  result = {
    ...(result || {}),
    ...recalculatedResult,
    deductions: recalculatedResult.deductions,
    custody: recalculatedResult.custody,
    netDue: recalculatedResult.netDue,
  };

  const calendarYear = result.calendarYear || getCashCalendarYear(data);
  const fiscalGroups = result.fiscalGroups || [];
  const groupedMonthRows = fiscalGroups.map(g => {
    const rows = MONTHS_AR.map((month,i) => {
      const d=toInteger(data.monthDays?.[i])||0;
      if(d===0) return "";
      const fy = getFiscalYearInfo(calendarYear, i).label;
      if (fy !== g.fiscalYear) return "";
      return `<tr><td>${month}</td><td>${d} يوم</td><td>${fmtLatnNumber(result.monthAmounts[i],{minimumFractionDigits:3,maximumFractionDigits:3})} د.ك</td></tr>`;
    }).filter(Boolean).join("");
    return `<tr class="fiscal-head"><td colspan="3">السنة المالية ${g.fiscalYear}</td></tr>${rows}<tr class="fiscal-subtotal"><td>إجمالي السنة المالية ${g.fiscalYear}</td><td>${toEnglishDigits(g.totalDays)} يوم</td><td>${fmtLatnNumber(g.totalAmount,{minimumFractionDigits:3,maximumFractionDigits:3})} د.ك</td></tr>`;
  }).join("");
  const monthRows = groupedMonthRows || MONTHS_AR.map((month,i) => {
    const d=toInteger(data.monthDays?.[i])||0;
    if(d===0) return "";
    return `<tr><td>${month}</td><td>${d} يوم</td><td>${fmtLatnNumber(result.monthAmounts[i],{minimumFractionDigits:3,maximumFractionDigits:3})} د.ك</td></tr>`;
  }).filter(Boolean).join("");
  const fiscalSummaryRows = fiscalGroups.map(g => `
    <tr><td>${g.fiscalYear}</td><td>${g.months.join("، ")}</td><td>${toEnglishDigits(g.totalDays)} يوم</td><td>${fmtLatnNumber(g.totalAmount,{minimumFractionDigits:3,maximumFractionDigits:3})} د.ك</td></tr>
  `).join("");
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"/>
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Arabic:wght@400;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
@page{size:A4;margin:14mm;}
body{font-family:'IBM Plex Arabic',Arial,sans-serif;direction:rtl;background:#fff;color:#1a202c;padding:22px;}
.header{direction:ltr;display:grid;grid-template-columns:220px 1fr 220px;align-items:center;gap:0;margin-bottom:24px;padding:10px 0 18px;border-bottom:2px solid #e2e8f0;min-height:108px;}
.header-left{grid-column:1;display:flex;justify-content:flex-start;align-items:center;min-width:0;}
.header-left img{max-width:205px;max-height:74px;object-fit:contain;}
.header-main{grid-column:2;text-align:center;direction:rtl;display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:0;padding:0 18px;}
.header-main h1{font-size:25px;font-weight:800;color:#1a202c;margin:0 0 7px;line-height:1.25;white-space:nowrap;}
.header-main .sub{font-size:14px;font-weight:700;color:#475569;margin-top:0;line-height:1.35;white-space:nowrap;}
.header-right{grid-column:3;display:flex;justify-content:flex-end;align-items:center;min-width:0;}
.header-right img{max-width:82px;max-height:82px;object-fit:contain;}
.meta{display:flex;gap:16px;margin-bottom:22px;}
.meta-box{flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:74px;}
.meta-box label{font-size:11px;color:#64748b;font-weight:600;display:block;margin-bottom:6px;text-align:center;width:100%;}
.meta-box span{font-size:15px;font-weight:700;color:#1a202c;display:block;text-align:center;width:100%;}
.section{margin-bottom:20px;}
.section-title{font-size:13px;font-weight:700;color:#0891b2;border-bottom:2px solid #0891b2;padding-bottom:6px;margin-bottom:14px;}
table{width:100%;border-collapse:collapse;}
thead td{background:#f0f9ff;font-weight:700;color:#0891b2;font-size:12px;padding:10px 14px;border-bottom:2px solid #bae6fd;}
td{padding:9px 14px;font-size:13px;border-bottom:1px solid #f1f5f9;}
td:first-child{color:#64748b;width:55%;} td:last-child{font-weight:600;color:#1a202c;text-align:left;}
.fiscal-head td{background:#e0f2fe!important;color:#0369a1!important;font-weight:800!important;text-align:center!important;border-top:2px solid #0891b2;border-bottom:1px solid #7dd3fc;}
.fiscal-subtotal td{background:#f0f9ff!important;font-weight:800!important;color:#0f172a!important;}
.summary-table td:first-child{color:#64748b;width:55%;} .summary-table td:last-child{font-weight:600;text-align:left;}
.fiscal-table td{font-size:12px;text-align:center;}
.fiscal-table thead td{font-size:12px;}
.fiscal-table .totals-row td{font-weight:700;}
.totals-row{background:#f0f9ff;font-weight:700;}
.result-box{background:linear-gradient(135deg,#0891b218,#0891b208);border:2px solid #0891b240;border-radius:10px;padding:16px 20px;margin-top:20px;display:flex;justify-content:space-between;align-items:center;}
.result-box .label{font-size:14px;color:#475569;} .result-box .amount{font-size:24px;font-weight:700;color:#0891b2;}
.signatures{margin-top:34px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px;direction:rtl;}
.sig-box{min-height:86px;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;text-align:center;background:#fff;display:flex;flex-direction:column;justify-content:space-between;}
.sig-title{font-size:13px;font-weight:700;color:#1a202c;}
.sig-line{height:36px;border-bottom:1px dashed #94a3b8;margin:0 10px;}
.footer{margin-top:28px;border-top:1px solid #e2e8f0;padding-top:14px;display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;}
@media print{body{padding:0;}}
</style></head><body>
<div class="header"><div class="header-left"><img src="${CSC_WORDMARK_DATA_URL}" alt="ديوان الخدمة المدنية"/></div><div class="header-main"><h1>نموذج حساب البدل النقدي</h1><div class="sub">ديوان الخدمة المدنية - إدارة الشئون المالية</div></div><div class="header-right"><img src="${CSC_LOGO_DATA_URL}" alt="شعار ديوان الخدمة المدنية"/></div></div>
<div class="meta">
  <div class="meta-box"><label>الاسم الكامل</label><span>${data.name||"—"}</span></div>
  <div class="meta-box"><label>الرقم المدني</label><span>${data.civilId||"—"}</span></div>
  <div class="meta-box"><label>الراتب الأساسي</label><span>${fmtKWD(toNumber(data.salary)||0)}</span></div>
  <div class="meta-box"><label>إجمالي الأيام</label><span>${result.totalDays} يوم</span></div>
  <div class="meta-box"><label>سنة أشهر الاستحقاق</label><span>${toEnglishDigits(result.calendarYear || getCashCalendarYear(data))}</span></div>
</div>
<div class="section"><div class="section-title">تفصيل أيام وقيمة الاستحقاق مفصول حسب السنة المالية</div>
<table><thead><tr><td>الشهر</td><td>عدد الأيام</td><td>مبلغ الاستحقاق</td></tr></thead>
<tbody>${monthRows}<tr class="totals-row"><td>الإجمالي العام</td><td>${result.totalDays} يوم</td><td>${fmtLatnNumber(result.totalAmount,{minimumFractionDigits:3})} د.ك</td></tr></tbody>
</table></div>
${fiscalSummaryRows?`<div class="section"><div class="section-title">تجميع حسب السنة المالية من 01 أبريل إلى 31 مارس</div>
<table class="fiscal-table"><thead><tr><td>السنة المالية</td><td>الشهور</td><td>إجمالي الأيام</td><td>إجمالي المبلغ</td></tr></thead>
<tbody>${fiscalSummaryRows}<tr class="totals-row"><td colspan="2">الإجمالي العام</td><td>${result.totalDays} يوم</td><td>${fmtLatnNumber(result.totalAmount,{minimumFractionDigits:3})} د.ك</td></tr></tbody></table></div>`:""}
<div class="section"><div class="section-title">الملخص المالي</div>
<table class="summary-table">
  <tr><td>إجمالي مبلغ الاستحقاق</td><td>${fmtKWD(result.totalAmount)}</td></tr>
  ${result.deductions>0?`<tr><td>الاستقطاعات</td><td>(${fmtKWD(result.deductions)})</td></tr>`:""}
  ${result.custody>0?`<tr><td>عهد تحت التحصيل</td><td>(${fmtKWD(result.custody)})</td></tr>`:""}
</table>
<div class="result-box"><span class="label">صافي المستحق</span><span class="amount">${fmtKWD(result.netDue)}</span></div>
</div>
<div class="signatures">
  <div class="sig-box"><div class="sig-title">معد النموذج</div><div class="sig-line"></div></div>
  <div class="sig-box"><div class="sig-title">رئيس القسم</div><div class="sig-line"></div></div>
  <div class="sig-box"><div class="sig-title">المراجعة</div><div class="sig-line"></div></div>
</div>
<div class="footer"><span>نظام الحسابات المالية — ديوان الخدمة المدنية</span><span>تاريخ الطباعة: ${fmtLatnDate()}</span></div>
</body></html>`;
}

function exportPDF(htmlContent) {
  const win = window.open("","_blank","width=900,height=700");
  if(!win){alert("يرجى السماح بالنوافذ المنبثقة");return;}
  win.document.write(toEnglishDigits(htmlContent)); win.document.close(); win.focus();
  setTimeout(()=>win.print(),800);
}

// ==================== CSS ====================
const css = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Arabic:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{background:${C.bg};font-family:'IBM Plex Arabic',sans-serif;direction:rtl;}
::-webkit-scrollbar{width:6px;} ::-webkit-scrollbar-track{background:${C.bg};} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px;}
input{outline:none;} input:focus{border-color:${C.accent}!important;box-shadow:0 0 0 3px ${C.accentGlow}!important;}
.btn{transition:all 0.15s;cursor:pointer;border:none;font-family:inherit;}
.btn:hover{opacity:0.85;transform:translateY(-1px);} .btn:active{transform:translateY(0);}
.num-input::-webkit-inner-spin-button{-webkit-appearance:none;}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
.fade-in{animation:fadeIn 0.3s ease;}
.rec-item{transition:all 0.2s;}
.rec-item:hover{background:${C.surfaceHover}!important;border-color:${C.borderLight}!important;}
@keyframes spin{to{transform:rotate(360deg);}}
.spin{animation:spin 0.8s linear infinite;display:inline-block;}
`;

// ==================== UI PRIMITIVES ====================
function Field({label,value,onChange,type="text",wide,placeholder}){
  return(
    <div style={{display:"flex",flexDirection:"column",gap:6,flex:wide?"1 1 200px":"1 1 110px"}}>
      <label style={{fontSize:12,color:C.textSecondary,fontWeight:500}}>{label}</label>
      <input className="num-input" type={type} value={toEnglishDigits(value)} placeholder={toEnglishDigits(placeholder||"")} onChange={e=>onChange(toEnglishDigits(e.target.value))}
        style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,color:C.textPrimary,
          fontSize:14,padding:"8px 12px",fontFamily:type==="number"?"JetBrains Mono,monospace":"inherit",width:"100%"}}/>
    </div>
  );
}

function SelectField({label,value,onChange,options,wide}){
  return(
    <div style={{display:"flex",flexDirection:"column",gap:6,flex:wide?"1 1 220px":"1 1 160px"}}>
      <label style={{fontSize:12,color:C.textSecondary,fontWeight:500}}>{label}</label>
      <select value={value || ""} onChange={e=>onChange(e.target.value)}
        style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,color:C.textPrimary,
          fontSize:14,padding:"8px 12px",fontFamily:"inherit",width:"100%",outline:"none"}}>
        {options.map(opt=><option key={opt.code} value={opt.code}>{opt.code} - {opt.name}</option>)}
      </select>
    </div>
  );
}
function SecHead({title,color,icon}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,paddingBottom:12,borderBottom:`1px solid ${C.border}`}}>
      <span style={{fontSize:20}}>{icon}</span>
      <span style={{fontSize:15,fontWeight:700,color}}>{title}</span>
    </div>
  );
}
function ResBox({label,value,color,large}){
  return(
    <div style={{background:`linear-gradient(135deg,${color}18,${color}08)`,border:`1px solid ${color}35`,borderRadius:10,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span style={{fontSize:13,color:C.textSecondary}}>{label}</span>
      <span style={{fontSize:large?20:15,fontWeight:700,color,fontFamily:"JetBrains Mono,monospace"}}>{value}</span>
    </div>
  );
}
function Card({children,style}){
  return <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:24,...style}}>{children}</div>;
}
function Btn({children,onClick,color,outline,gold,danger,small}){
  const bg = danger?`${C.red}20`:gold?`${C.gold}15`:outline?"transparent":`linear-gradient(135deg,${color},${color}bb)`;
  const bc = danger?`${C.red}40`:gold?`${C.gold}40`:outline?C.borderLight:`${color}00`;
  const fc = danger?C.red:gold?C.gold:outline?C.textSecondary:"#fff";
  return(
    <button className="btn" onClick={onClick} style={{background:bg,border:`1px solid ${bc}`,color:fc,borderRadius:8,
      padding:small?"6px 12px":"10px 20px",fontSize:small?12:14,fontWeight:600,
      boxShadow:(!outline&&!gold&&!danger)?`0 4px 14px ${color}35`:"none"}}>
      {children}
    </button>
  );
}

// ==================== DEBT FORM ====================
const dftDebt={name:"",civilId:"",amountDiwan:"",amountAttache:"",attacheCurrency:"USD",attacheCurrencyOther:"",exchangeRate:"",fullDebtAmount:"",
  missionStartDay:"",missionStartMonth:"",missionStartYear:"",
  missionEndDay:"",missionEndMonth:"",missionEndYear:"",returnMonth:"",
  stopStartDay:"",stopStartMonth:"",stopStartYear:"",
  stopEndDay:"",stopEndMonth:"",stopEndYear:"",
  serviceStartDay:"",serviceStartMonth:"",serviceStartYear:"",
  serviceEndDay:"",serviceEndMonth:"",serviceEndYear:""};

function DebtForm({initial,onSave,onCancel,color,saving}){
  const [d,setD]=useState(initial||dftDebt);
  const set=k=>v=>setD(p=>({...p,[k]:v}));
  const selectedAttacheCurrency = d.attacheCurrency || "USD";
  const setAttacheCurrency = v => setD(p => ({...p, attacheCurrency:v, exchangeRate:v === "KWD" ? "1" : p.exchangeRate}));
  const res=calcDebt(d);
  const fmt=n=>(!n||isNaN(n)||n===0)?"—":fmtLatnNumber(n,{minimumFractionDigits:3,maximumFractionDigits:3})+" د.ك";
  const fmtN=n=>fmtLatnNumber(n,{minimumFractionDigits:3,maximumFractionDigits:3});
  const fmtM=(y,m,dd)=>`${toEnglishDigits(y||0)} سنة ${toEnglishDigits(m||0)} شهر ${toEnglishDigits(dd||0)} يوم`;
  return(
    <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:20}}>
      <Card><SecHead title="البيانات الشخصية" color={color} icon="👤"/>
        <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
          <Field label="الاسم الكامل" value={d.name} onChange={set("name")} wide placeholder="أدخل الاسم"/>
          <Field label="الرقم المدني" value={d.civilId} onChange={set("civilId")} placeholder="12 رقم"/>
        </div>
      </Card>
      <Card><SecHead title="المبالغ المالية" color={color} icon="💰"/>
        <div style={{
          display:"grid",
          gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",
          gap:14,
          alignItems:"end"
        }}>
          <Field label="مبالغ الديوان (د.ك)" type="number" value={d.amountDiwan} onChange={set("amountDiwan")}/>
          <SelectField label="عملة الملحق الثقافي" value={selectedAttacheCurrency} onChange={setAttacheCurrency} options={CURRENCY_OPTIONS} wide/>
          <Field label="مبلغ الملحق الثقافي" type="number" value={d.amountAttache} onChange={set("amountAttache")} placeholder={`بالـ ${res.attacheCurrency || getAttacheCurrencyCode(d)}`}/>
          {selectedAttacheCurrency === "OTHER"&&<Field label="رمز العملة" value={d.attacheCurrencyOther} onChange={set("attacheCurrencyOther")} placeholder="مثال: MXN"/>}
          <Field label={selectedAttacheCurrency === "KWD" ? "سعر الصرف (تلقائي)" : "سعر الصرف مقابل الدينار"} type="number" value={selectedAttacheCurrency === "KWD" ? "1" : d.exchangeRate} onChange={selectedAttacheCurrency === "KWD" ? ()=>{} : set("exchangeRate")} placeholder="0.336924"/>
          <Field label="المستحق 100% (د.ك)" type="number" value={d.fullDebtAmount} onChange={set("fullDebtAmount")} placeholder="0"/>
        </div>
        {res.totalKWD>0&&<div style={{
          marginTop:14,
          display:"grid",
          gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",
          gap:10
        }}>
          <ResBox label="يعادل مبلغ الملحق بالدينار الكويتي" value={fmt(res.attacheAmountKWD)} color={C.gold}/>
          <ResBox label="إجمالي المبلغ بالدينار الكويتي" value={fmt(res.totalKWD)} color={color}/>
          {res.fullDebtAmount>0&&<ResBox label="المستحق 100%" value={fmt(res.fullDebtAmount)} color={C.gold}/>} 
        </div>}
      </Card>
      <Card><SecHead title="فترة البعثة — تطبيق المادة (33) من القرار رقم 86/10" color={color} icon="📅"/>
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div><div style={{fontSize:12,color:C.textMuted,marginBottom:8,fontWeight:600}}>بداية البعثة</div>
            <div style={{display:"flex",gap:12}}>
              <Field label="يوم" type="number" value={d.missionStartDay} onChange={set("missionStartDay")}/>
              <Field label="شهر" type="number" value={d.missionStartMonth} onChange={set("missionStartMonth")}/>
              <Field label="سنة" type="number" value={d.missionStartYear} onChange={set("missionStartYear")}/>
            </div>
          </div>
          <div><div style={{fontSize:12,color:C.textMuted,marginBottom:8,fontWeight:600}}>نهاية البعثة</div>
            <div style={{display:"flex",gap:12}}>
              <Field label="يوم" type="number" value={d.missionEndDay} onChange={set("missionEndDay")}/>
              <Field label="شهر" type="number" value={d.missionEndMonth} onChange={set("missionEndMonth")}/>
              <Field label="سنة" type="number" value={d.missionEndYear} onChange={set("missionEndYear")}/>
            </div>
          </div>
          <Field label="شهر العودة (أشهر إضافية)" type="number" value={d.returnMonth} onChange={set("returnMonth")}/>
          {res.missionTotal>0&&<ResBox label="مدة البعثة" value={`${fmtM(res.missionYears,res.missionMonths,res.missionDays)} — ${fmtN(res.missionTotal)} شهر`} color={color}/>} 
        </div>
      </Card>
      <Card><SecHead title="فترة الوقف" color={color} icon="⏸️"/>
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div><div style={{fontSize:12,color:C.textMuted,marginBottom:8,fontWeight:600}}>بداية الوقف</div>
            <div style={{display:"flex",gap:12}}>
              <Field label="يوم" type="number" value={d.stopStartDay} onChange={set("stopStartDay")}/>
              <Field label="شهر" type="number" value={d.stopStartMonth} onChange={set("stopStartMonth")}/>
              <Field label="سنة" type="number" value={d.stopStartYear} onChange={set("stopStartYear")}/>
            </div>
          </div>
          <div><div style={{fontSize:12,color:C.textMuted,marginBottom:8,fontWeight:600}}>نهاية الوقف</div>
            <div style={{display:"flex",gap:12}}>
              <Field label="يوم" type="number" value={d.stopEndDay} onChange={set("stopEndDay")}/>
              <Field label="شهر" type="number" value={d.stopEndMonth} onChange={set("stopEndMonth")}/>
              <Field label="سنة" type="number" value={d.stopEndYear} onChange={set("stopEndYear")}/>
            </div>
          </div>
          {res.stopTotal>0&&<ResBox label="مدة الوقف" value={`${fmtM(res.stopYears,res.stopMonths,res.stopDays)} — ${fmtN(res.stopTotal)} شهر`} color={C.gold}/>} 
        </div>
      </Card>
      <Card><SecHead title="فترة الخدمة" color={color} icon="🏢"/>
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div><div style={{fontSize:12,color:C.textMuted,marginBottom:8,fontWeight:600}}>مباشر العمل</div>
            <div style={{display:"flex",gap:12}}>
              <Field label="يوم" type="number" value={d.serviceStartDay} onChange={set("serviceStartDay")}/>
              <Field label="شهر" type="number" value={d.serviceStartMonth} onChange={set("serviceStartMonth")}/>
              <Field label="سنة" type="number" value={d.serviceStartYear} onChange={set("serviceStartYear")}/>
            </div>
          </div>
          <div><div style={{fontSize:12,color:C.textMuted,marginBottom:8,fontWeight:600}}>تاريخ الاستقالة / نهاية الخدمة</div>
            <div style={{display:"flex",gap:12}}>
              <Field label="يوم" type="number" value={d.serviceEndDay} onChange={set("serviceEndDay")}/>
              <Field label="شهر" type="number" value={d.serviceEndMonth} onChange={set("serviceEndMonth")}/>
              <Field label="سنة" type="number" value={d.serviceEndYear} onChange={set("serviceEndYear")}/>
            </div>
          </div>
          {res.serviceTotal>0&&<ResBox label="مدة الخدمة" value={`${fmtM(res.serviceYears,res.serviceMonths,res.serviceDays)} — ${fmtN(res.serviceTotal)} شهر`} color={color}/>} 
        </div>
      </Card>
      {res.totalKWD>0&&res.missionTotal>0&&(
        <Card style={{border:`1px solid ${color}40`,background:`linear-gradient(135deg,${color}10,${C.surface})`}}>
          <SecHead title="نتائج الحساب وفق نموذج الوقف" color={color} icon="📊"/>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <ResBox label="مدة البعثة" value={`${fmtM(res.missionYears,res.missionMonths,res.missionDays)} — ${fmtN(res.missionTotal)} شهر`} color={color}/>
            {res.stopTotal>0&&<ResBox label="مدة الوقف" value={`${fmtM(res.stopYears,res.stopMonths,res.stopDays)} — ${fmtN(res.stopTotal)} شهر`} color={C.gold}/>} 
            <ResBox label="مدة الخدمة" value={`${fmtM(res.serviceYears,res.serviceMonths,res.serviceDays)} — ${fmtN(res.serviceTotal)} شهر`} color={color}/>
            <ResBox label="المدة التي لم يخدم مقابلها" value={`${fmtM(res.unservedYears,res.unservedMonths,res.unservedDays)} — ${fmtN(res.unservedTotal)} شهر`} color={C.gold}/>
            <div style={{height:1,background:C.border}}/>
            <ResBox label="المستحق 50%" value={fmt(res.partialDebt)} color={color}/>
            <ResBox label="المستحق 100%" value={fmt(res.fullDebtAmount)} color={C.gold}/>
            <ResBox label="إجمالي المديونية بعد تطبيق المادة (33)" value={fmt(res.totalDebt)} color={color} large/>
          </div>
        </Card>
      )}
      <div style={{display:"flex",gap:10,justifyContent:"flex-end",flexWrap:"wrap"}}>
        {onCancel&&<Btn outline onClick={onCancel}>إلغاء</Btn>}
        <Btn gold onClick={()=>exportPDF(generateDebtPDF(d,res,fmtLatnDate()))}>🖨️ طباعة / PDF</Btn>
        <Btn color={color} onClick={()=>onSave(d,res)}>{saving?<span>⏳ جاري الحفظ...</span>:"💾 حفظ السجل"}</Btn>
      </div>
    </div>
  );
}

// ==================== CASH FORM ====================
const dftCash={name:"",civilId:"",salary:"",cashYear:String(new Date().getFullYear()),monthDays:Array(12).fill(""),deductions:"",custody:""};

function CashForm({initial,onSave,onCancel,color,saving}){
  const [d,setD]=useState(()=>{
    const base = initial ? {...dftCash,...initial,monthDays:initial.monthDays||Array(12).fill("")} : {...dftCash,monthDays:Array(12).fill("")};
    return {...base,cashYear:base.cashYear||String(new Date().getFullYear())};
  });
  const set=k=>v=>setD(p=>({...p,[k]:v}));
  const setM=i=>v=>setD(p=>{const a=[...p.monthDays];a[i]=v;return{...p,monthDays:a};});
  const res=calcCash(d);
  const fmt=n=>(!n||isNaN(n)||!isFinite(n))?"—":fmtLatnNumber(n,{minimumFractionDigits:3,maximumFractionDigits:3})+" د.ك";
  const hasData=res.totalDays>0;
  return(
    <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:20}}>
      <Card><SecHead title="البيانات الشخصية" color={color} icon="👤"/>
        <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
          <Field label="الاسم الكامل" value={d.name} onChange={set("name")} wide placeholder="أدخل الاسم"/>
          <Field label="الرقم المدني" value={d.civilId} onChange={set("civilId")}/>
          <Field label="الراتب الأساسي (د.ك)" type="number" value={d.salary} onChange={set("salary")}/>
          <Field label="سنة أشهر الاستحقاق" type="number" value={d.cashYear} onChange={set("cashYear")} placeholder="2026"/>
        </div>
      </Card>
      <Card><SecHead title="تفصيل أيام الاستحقاق" color={color} icon="📆"/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
          {MONTHS_AR.map((month,i)=>{
            const active=(toInteger(d.monthDays[i])||0)>0;
            return(
              <div key={i} style={{background:active?`${color}12`:C.bg,border:`1px solid ${active?color+"40":C.border}`,borderRadius:10,padding:"10px 12px",transition:"all 0.2s"}}>
                <div style={{fontSize:11,color:C.textMuted,marginBottom:6,fontWeight:600}}>{month}</div>
                <input className="num-input" type="number" value={toEnglishDigits(d.monthDays[i])} onChange={e=>setM(i)(toEnglishDigits(e.target.value))} placeholder="0" min={0} max={31}
                  style={{background:"transparent",border:"none",color:active?color:C.textPrimary,fontSize:18,fontWeight:700,width:"100%",fontFamily:"JetBrains Mono,monospace"}}/>
                {res.monthAmounts[i]>0&&<div style={{fontSize:10,color:C.textMuted,marginTop:4}}>{fmtLatnNumber(res.monthAmounts[i],{maximumFractionDigits:2})} د.ك</div>}
              </div>
            );
          })}
        </div>
        {hasData&&(
          <div style={{marginTop:16,display:"flex",gap:12}}>
            <div style={{flex:1,background:`${color}12`,border:`1px solid ${color}35`,borderRadius:10,padding:"12px 16px",textAlign:"center"}}>
              <div style={{fontSize:11,color:C.textMuted,marginBottom:4}}>إجمالي الأيام</div>
              <div style={{fontSize:24,fontWeight:700,color,fontFamily:"JetBrains Mono"}}>{res.totalDays}</div>
            </div>
            <div style={{flex:2,background:`${color}12`,border:`1px solid ${color}35`,borderRadius:10,padding:"12px 16px",textAlign:"center"}}>
              <div style={{fontSize:11,color:C.textMuted,marginBottom:4}}>إجمالي مبلغ الاستحقاق</div>
              <div style={{fontSize:20,fontWeight:700,color,fontFamily:"JetBrains Mono"}}>{fmt(res.totalAmount)}</div>
            </div>
          </div>
        )}
        {hasData&&res.fiscalGroups?.length>0&&(
          <div style={{marginTop:16,display:"flex",flexDirection:"column",gap:8}}>
            <div style={{fontSize:12,color:C.textSecondary,fontWeight:700}}>تجميع حسب السنة المالية من 01 أبريل إلى 31 مارس</div>
            {res.fiscalGroups.map(g=>(
              <div key={g.fiscalYear} style={{background:C.bg,border:`1px solid ${color}30`,borderRadius:10,padding:"10px 12px",display:"grid",gridTemplateColumns:"1fr 1.5fr 1fr 1fr",gap:8,alignItems:"center",fontSize:12,color:C.textSecondary}}>
                <div style={{fontWeight:700,color}}>{g.fiscalYear}</div>
                <div>{g.months.join("، ")}</div>
                <div style={{fontFamily:"JetBrains Mono",color:C.textPrimary}}>{toEnglishDigits(g.totalDays)} يوم</div>
                <div style={{fontFamily:"JetBrains Mono",fontWeight:700,color:C.textPrimary}}>{fmt(g.totalAmount)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card><SecHead title="الاستقطاعات" color={color} icon="➖"/>
        <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
          <Field label="الاستقطاعات (د.ك)" type="number" value={d.deductions} onChange={set("deductions")} placeholder="0"/>
          <Field label="عهد تحت التحصيل (د.ك)" type="number" value={d.custody} onChange={set("custody")} placeholder="0"/>
        </div>
      </Card>
      {hasData&&(
        <Card style={{border:`1px solid ${color}40`,background:`linear-gradient(135deg,${color}10,${C.surface})`}}>
          <SecHead title="الملخص المالي" color={color} icon="📊"/>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <ResBox label="إجمالي مبلغ الاستحقاق" value={fmt(res.totalAmount)} color={color}/>
            {res.deductions>0&&<ResBox label="الاستقطاعات" value={`(${fmt(res.deductions)})`} color={C.red}/>}
            {res.custody>0&&<ResBox label="عهد تحت التحصيل" value={`(${fmt(res.custody)})`} color={C.gold}/>}
            <div style={{height:1,background:C.border}}/>
            <ResBox label="صافي المستحق" value={fmt(res.netDue)} color={color} large/>
          </div>
        </Card>
      )}
      <div style={{display:"flex",gap:10,justifyContent:"flex-end",flexWrap:"wrap"}}>
        {onCancel&&<Btn outline onClick={onCancel}>إلغاء</Btn>}
        <Btn gold onClick={()=>exportPDF(generateCashPDF(d,res,fmtLatnDate()))}>🖨️ طباعة / PDF</Btn>
        <Btn color={color} onClick={()=>onSave(d,res)}>{saving?<span>⏳ جاري الحفظ...</span>:"💾 حفظ السجل"}</Btn>
      </div>
    </div>
  );
}

// ==================== RECORDS LIST ====================
function RecordsList({records,onEdit,onDelete,onPrint,color,type,loading}){
  if(loading) return(
    <div style={{textAlign:"center",padding:"48px",color:C.textMuted}}>
      <div className="spin" style={{fontSize:32,marginBottom:12}}>⏳</div>
      <div>جاري تحميل السجلات...</div>
    </div>
  );
  if(records.length===0) return(
    <div style={{textAlign:"center",padding:"48px",color:C.textMuted}}>
      <div style={{fontSize:40,marginBottom:16}}>📭</div>
      <div style={{fontSize:15}}>لا توجد سجلات محفوظة بعد</div>
    </div>
  );
  return(
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {records.map(rec=>(
        <div key={rec.id} className="rec-item" style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <div style={{fontSize:15,fontWeight:700,color:C.textPrimary}}>{toEnglishDigits(rec.name||rec.data?.name||"بدون اسم")}</div>
            <div style={{fontSize:12,color:C.textMuted}}>{toEnglishDigits(rec.civil_id||rec.data?.civilId||"—")} • {fmtLatnDate(rec.saved_at||rec.created_at)}</div>
            <div style={{fontSize:13,color,fontFamily:"JetBrains Mono",fontWeight:600}}>
              {type==="debt"
                ?(rec.result?.totalDebt>0?fmtLatnNumber(rec.result.totalDebt,{maximumFractionDigits:3})+" د.ك":"—")
                :(rec.result?.netDue>0?fmtLatnNumber(rec.result.netDue,{maximumFractionDigits:3})+" د.ك":"—")}
            </div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <Btn gold small onClick={()=>onPrint(rec)}>🖨️ طباعة</Btn>
            <Btn color={color} small onClick={()=>onEdit(rec)}>✏️ تعديل</Btn>
            <Btn danger small onClick={()=>onDelete(rec.id)}>🗑️</Btn>
          </div>
        </div>
      ))}
    </div>
  );
}

// ==================== SECTION VIEW ====================
function SectionView({type,color,title,icon}){
  const [records,setRecords]=useState([]);
  const [view,setView]=useState("list");
  const [editRec,setEditRec]=useState(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [toast,setToast]=useState(null);

  const showToast=(msg,err)=>{setToast({msg,err});setTimeout(()=>setToast(null),3000);};

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const data=type==="debt"?await fetchDebtRecords():await fetchCashRecords();
      setRecords(data||[]);
    }catch(e){showToast("❌ خطأ في تحميل البيانات: "+e.message,true);}
    finally{setLoading(false);}
  },[type]);

  useEffect(()=>{load();},[load]);

  const handleSave=async(data,result)=>{
    setSaving(true);
    try{
      const cleanData = normalizeDigitsDeep(data);
      const payload={name:cleanData.name,civil_id:cleanData.civilId,data:cleanData,result,saved_at:new Date().toISOString()};
      if(editRec){
        await (type==="debt"?updateDebtRecord:updateCashRecord)(editRec.id,payload);
        showToast("✅ تم تحديث السجل بنجاح");
      }else{
        await (type==="debt"?saveDebtRecord:saveCashRecord)(payload);
        showToast("✅ تم حفظ السجل بنجاح");
      }
      await load(); setView("list"); setEditRec(null);
    }catch(e){showToast("❌ فشل الحفظ: "+e.message,true);}
    finally{setSaving(false);}
  };

  const handleDelete=async(id)=>{
    if(!window.confirm("هل أنت متأكد من حذف هذا السجل؟")) return;
    try{
      await (type==="debt"?deleteDebtRecord:deleteCashRecord)(id);
      showToast("🗑️ تم حذف السجل"); await load();
    }catch(e){showToast("❌ فشل الحذف: "+e.message,true);}
  };

  const handlePrint=rec=>{
    const html=type==="debt"
      ?generateDebtPDF(rec.data,rec.result,fmtLatnDate(rec.saved_at))
      :generateCashPDF(rec.data,rec.result,fmtLatnDate(rec.saved_at));
    exportPDF(html);
  };

  return(
    <div style={{position:"relative"}}>
      {toast&&(
        <div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",background:toast.err?"#450a0a":C.surface,border:`1px solid ${toast.err?C.red+"60":color+"40"}`,color:C.textPrimary,padding:"12px 24px",borderRadius:12,fontSize:14,zIndex:1000,boxShadow:"0 8px 24px rgba(0,0,0,0.5)",animation:"fadeIn 0.3s ease",maxWidth:"90vw",textAlign:"center"}}>
          {toast.msg}
        </div>
      )}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24,gap:16,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:44,height:44,borderRadius:12,background:`linear-gradient(135deg,${color},${color}80)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>{icon}</div>
          <div>
            <div style={{fontSize:18,fontWeight:700,color:C.textPrimary}}>{title}</div>
            <div style={{fontSize:12,color:C.textMuted}}>{records.length} سجل محفوظ</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          {["list","new"].map(v=>(
            <button key={v} className="btn" onClick={()=>{setView(v);setEditRec(null);}} style={{background:view===v?`${color}20`:"transparent",border:`1px solid ${view===v?color+"50":C.border}`,color:view===v?color:C.textSecondary,borderRadius:8,padding:"8px 16px",fontSize:13,fontWeight:600}}>
              {v==="list"?"📋 السجلات":"➕ حساب جديد"}
            </button>
          ))}
          <button className="btn" onClick={load} style={{background:"transparent",border:`1px solid ${C.border}`,color:C.textMuted,borderRadius:8,padding:"8px 12px",fontSize:13}} title="تحديث">🔄</button>
        </div>
      </div>
      {view==="list"&&<RecordsList records={records} onEdit={r=>{setEditRec(r);setView("edit");}} onDelete={handleDelete} onPrint={handlePrint} color={color} type={type} loading={loading}/>}
      {view==="new"&&(type==="debt"?<DebtForm onSave={handleSave} onCancel={()=>setView("list")} color={color} saving={saving}/>:<CashForm onSave={handleSave} onCancel={()=>setView("list")} color={color} saving={saving}/>)}
      {view==="edit"&&editRec&&(type==="debt"?<DebtForm initial={editRec.data} onSave={handleSave} onCancel={()=>setView("list")} color={color} saving={saving}/>:<CashForm initial={editRec.data} onSave={handleSave} onCancel={()=>setView("list")} color={color} saving={saving}/>)}
    </div>
  );
}

// ==================== APP ====================
export default function App(){
  const [tab,setTab]=useState("debt");
  const [counts,setCounts]=useState({debt:0,cash:0});

  useEffect(()=>{
    fetchDebtRecords().then(d=>setCounts(c=>({...c,debt:d?.length||0}))).catch(()=>{});
    fetchCashRecords().then(d=>setCounts(c=>({...c,cash:d?.length||0}))).catch(()=>{});
  },[]);

  return(
    <>
      <style>{css}</style>
      <div style={{minHeight:"100vh",background:C.bg,backgroundImage:`radial-gradient(ellipse at 20% 20%,rgba(124,58,237,0.06) 0%,transparent 60%),radial-gradient(ellipse at 80% 80%,rgba(8,145,178,0.06) 0%,transparent 60%)`,padding:"0 0 48px"}}>
        <div style={{background:`${C.surface}ee`,backdropFilter:"blur(20px)",borderBottom:`1px solid ${C.border}`,padding:"20px 32px",marginBottom:32,position:"sticky",top:0,zIndex:100}}>
          <div style={{maxWidth:920,margin:"0 auto",display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap"}}>
            <div>
              <div style={{fontSize:20,fontWeight:800,color:C.textPrimary}}>🏛️ نظام الحسابات المالية</div>
              <div style={{fontSize:12,color:C.textMuted,marginTop:2}}>ديوان الخدمة المدنية — المديريات المالية</div>
            </div>
            <div style={{display:"flex",gap:8}}>
              {[{k:"debt",label:"مديونية",color:C.debtLight,bg:C.debt},{k:"cash",label:"بدل نقدي",color:C.cashLight,bg:C.cash}].map(t=>(
                <div key={t.k} style={{textAlign:"center",padding:"6px 16px",background:`${t.bg}15`,border:`1px solid ${t.bg}30`,borderRadius:8}}>
                  <div style={{fontSize:18,fontWeight:800,color:t.color,fontFamily:"JetBrains Mono"}}>{toEnglishDigits(counts[t.k])}</div>
                  <div style={{fontSize:10,color:C.textMuted}}>{t.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{maxWidth:920,margin:"0 auto",padding:"0 24px"}}>
          <div style={{display:"flex",background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:6,marginBottom:32,gap:4}}>
            {[{id:"debt",label:"حساب المديونية",icon:"⚖️",color:C.debt},{id:"cash",label:"حساب البدل النقدي",icon:"💵",color:C.cash}].map(t=>(
              <button key={t.id} className="btn" onClick={()=>setTab(t.id)} style={{flex:1,padding:"14px 24px",background:tab===t.id?`linear-gradient(135deg,${t.color}25,${t.color}10)`:"transparent",border:tab===t.id?`1px solid ${t.color}40`:"1px solid transparent",color:tab===t.id?t.color:C.textSecondary,borderRadius:10,fontSize:15,fontWeight:tab===t.id?700:500,display:"flex",alignItems:"center",justifyContent:"center",gap:10,transition:"all 0.2s"}}>
                <span style={{fontSize:18}}>{t.icon}</span>{t.label}
              </button>
            ))}
          </div>
          {tab==="debt"&&<SectionView type="debt" color={C.debt} title="حساب المديونية" icon="⚖️"/>}
          {tab==="cash"&&<SectionView type="cash" color={C.cash} title="حساب البدل النقدي" icon="💵"/>}
        </div>
      </div>
    </>
  );
}
