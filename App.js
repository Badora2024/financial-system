import { useState, useEffect, useCallback } from "react";
import {
  fetchDebtRecords, saveDebtRecord, updateDebtRecord, deleteDebtRecord,
  fetchCashRecords, saveCashRecord, updateCashRecord, deleteCashRecord,
} from "./supabase";

// ==================== CALCULATIONS ====================
function calcDebt(d) {
  const totalKWD = (parseFloat(d.amountDiwan)||0) + (parseFloat(d.amountAttache)||0) * (parseFloat(d.exchangeRate)||0);
  const mEndY=parseInt(d.missionEndYear)||0, mEndM=parseInt(d.missionEndMonth)||0, mEndD=parseInt(d.missionEndDay)||0;
  const mStartY=parseInt(d.missionStartYear)||0, mStartM=parseInt(d.missionStartMonth)||0, mStartD=parseInt(d.missionStartDay)||0;
  let diffDays=mEndD-mStartD, diffMonths=mEndM-mStartM, diffYears=mEndY-mStartY;
  if(diffDays<0){diffDays+=30;diffMonths-=1;} if(diffMonths<0){diffMonths+=12;diffYears-=1;}
  const returnMonth=parseInt(d.returnMonth)||0;
  const missionDays=diffDays, missionMonths=diffMonths+returnMonth, missionYears=diffYears;
  const missionTotal=(missionYears*12)+missionMonths+(missionDays/30);
  const sEndY=parseInt(d.serviceEndYear)||0,sEndM=parseInt(d.serviceEndMonth)||0,sEndD=parseInt(d.serviceEndDay)||0;
  const sStartY=parseInt(d.serviceStartYear)||0,sStartM=parseInt(d.serviceStartMonth)||0,sStartD=parseInt(d.serviceStartDay)||0;
  let sdDays=sEndD-sStartD, sdMonths=sEndM-sStartM, sdYears=sEndY-sStartY;
  if(sdDays<0){sdDays+=30;sdMonths-=1;} if(sdMonths<0){sdMonths+=12;sdYears-=1;}
  const serviceDays=sdDays, serviceMonths=sdMonths, serviceYears=sdYears;
  const serviceTotal=(serviceYears*12)+serviceMonths+(serviceDays/30);
  const unservedTotal=(missionTotal>serviceTotal)?(missionTotal-serviceTotal):0;
  const totalDebt=missionTotal>0?(totalKWD*0.5*unservedTotal/missionTotal):0;
  return { totalKWD, missionDays, missionMonths, missionYears, missionTotal,
    serviceDays, serviceMonths, serviceYears, serviceTotal,
    unservedDays:Math.max(0,missionDays-serviceDays),
    unservedMonths:Math.max(0,missionMonths-serviceMonths),
    unservedYears:Math.max(0,missionYears-serviceYears),
    unservedTotal, totalDebt };
}

const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

function calcCash(d) {
  const salary=parseFloat(d.salary)||0;
  const days=d.monthDays||Array(12).fill(0);
  let totalDays=0, totalAmount=0;
  const monthAmounts=days.map((di,i)=>{
    const nd=parseInt(di)||0;
    const maxDays=i===1?28:(i===3||i===5||i===8||i===10)?30:31;
    totalDays+=nd;
    const amt=nd===0?0:(nd>=maxDays?salary:(salary*nd/maxDays));
    totalAmount+=amt; return amt;
  });
  const deductions=parseFloat(d.deductions)||0, custody=parseFloat(d.custody)||0;
  return { totalDays, totalAmount, monthAmounts, deductions, custody, netDue:totalAmount-deductions-custody };
}

// ==================== COLORS ====================
const C = {
  bg:"#0a0e1a", surface:"#111827", surfaceHover:"#1a2235", border:"#1e293b", borderLight:"#334155",
  accent:"#3b82f6", accentGlow:"rgba(59,130,246,0.15)", gold:"#f59e0b", green:"#10b981", red:"#ef4444",
  textPrimary:"#f1f5f9", textSecondary:"#94a3b8", textMuted:"#475569",
  debt:"#7c3aed", debtLight:"#a78bfa", cash:"#0891b2", cashLight:"#67e8f9",
};

// ==================== PDF ====================
const fmtKWD = n => (!n||isNaN(n))?"—":n.toLocaleString("ar-KW",{minimumFractionDigits:3,maximumFractionDigits:3})+" د.ك";
const fmtDur = (y,m,d) => `${y||0} سنة  ${m||0} شهر  ${d||0} يوم`;

function generateDebtPDF(data, result, savedAt) {
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"/>
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Arabic:wght@400;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'IBM Plex Arabic',Arial,sans-serif;direction:rtl;background:#fff;color:#1a202c;padding:32px;}
.header{background:linear-gradient(135deg,#7c3aed,#5b21b6);color:#fff;border-radius:12px;padding:24px 32px;margin-bottom:28px;display:flex;justify-content:space-between;align-items:center;}
.header h1{font-size:22px;font-weight:700;} .header .sub{font-size:12px;opacity:0.8;margin-top:4px;}
.meta{display:flex;gap:16px;margin-bottom:24px;}
.meta-box{flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;}
.meta-box label{font-size:11px;color:#64748b;font-weight:600;display:block;margin-bottom:4px;}
.meta-box span{font-size:15px;font-weight:700;color:#1a202c;}
.section{margin-bottom:24px;}
.section-title{font-size:13px;font-weight:700;color:#7c3aed;border-bottom:2px solid #7c3aed;padding-bottom:6px;margin-bottom:14px;}
table{width:100%;border-collapse:collapse;}
td{padding:9px 14px;font-size:13px;border-bottom:1px solid #f1f5f9;}
td:first-child{color:#64748b;width:55%;} td:last-child{font-weight:600;color:#1a202c;text-align:left;}
.result-box{background:linear-gradient(135deg,#7c3aed18,#7c3aed08);border:2px solid #7c3aed40;border-radius:10px;padding:16px 20px;margin-top:20px;display:flex;justify-content:space-between;align-items:center;}
.result-box .label{font-size:14px;color:#475569;} .result-box .amount{font-size:24px;font-weight:700;color:#7c3aed;}
.footer{margin-top:32px;border-top:1px solid #e2e8f0;padding-top:16px;display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;}
.stamp-area{border:2px dashed #e2e8f0;border-radius:8px;padding:24px;text-align:center;color:#cbd5e1;font-size:12px;margin-top:20px;}
@media print{body{padding:20px;}}
</style></head><body>
<div class="header"><div><div class="sub">ديوان الخدمة المدنية — المديريات المالية</div><h1>نموذج حساب المديونية</h1><div class="sub">تطبيق المادة (33) من القرار رقم 86/10</div></div><div style="font-size:40px">⚖️</div></div>
<div class="meta">
  <div class="meta-box"><label>الاسم الكامل</label><span>${data.name||"—"}</span></div>
  <div class="meta-box"><label>الرقم المدني</label><span>${data.civilId||"—"}</span></div>
  <div class="meta-box"><label>تاريخ الإصدار</label><span>${savedAt||new Date().toLocaleDateString("ar-KW")}</span></div>
</div>
<div class="section"><div class="section-title">المبالغ المالية</div>
<table>
  <tr><td>مبالغ صرفت عن طريق الديوان</td><td>${fmtKWD(parseFloat(data.amountDiwan)||0)}</td></tr>
  <tr><td>مبالغ صرفت عن طريق الملحق الثقافي</td><td>${(parseFloat(data.amountAttache)||0).toLocaleString("ar-KW",{minimumFractionDigits:2})} $</td></tr>
  <tr><td>سعر الصرف</td><td>${data.exchangeRate||"—"}</td></tr>
  <tr><td><strong>إجمالي المبلغ بالدينار الكويتي</strong></td><td><strong>${fmtKWD(result.totalKWD)}</strong></td></tr>
</table></div>
<div class="section"><div class="section-title">فترة البعثة</div>
<table>
  <tr><td>بداية البعثة</td><td>${data.missionStartDay||0}/${data.missionStartMonth||0}/${data.missionStartYear||0}</td></tr>
  <tr><td>نهاية البعثة</td><td>${data.missionEndDay||0}/${data.missionEndMonth||0}/${data.missionEndYear||0}</td></tr>
  <tr><td>شهر العودة</td><td>${data.returnMonth||0} شهر</td></tr>
  <tr><td><strong>مدة البعثة الإجمالية</strong></td><td><strong>${fmtDur(result.missionYears,result.missionMonths,result.missionDays)}</strong></td></tr>
</table></div>
<div class="section"><div class="section-title">فترة الخدمة</div>
<table>
  <tr><td>تاريخ مباشر العمل</td><td>${data.serviceStartDay||0}/${data.serviceStartMonth||0}/${data.serviceStartYear||0}</td></tr>
  <tr><td>تاريخ الاستقالة / نهاية الخدمة</td><td>${data.serviceEndDay||0}/${data.serviceEndMonth||0}/${data.serviceEndYear||0}</td></tr>
  <tr><td><strong>مدة الخدمة الإجمالية</strong></td><td><strong>${fmtDur(result.serviceYears,result.serviceMonths,result.serviceDays)}</strong></td></tr>
</table></div>
<div class="section"><div class="section-title">تفاصيل المديونية</div>
<table>
  <tr><td>مدة البعثة</td><td>${fmtDur(result.missionYears,result.missionMonths,result.missionDays)}</td></tr>
  <tr><td>مدة الخدمة</td><td>${fmtDur(result.serviceYears,result.serviceMonths,result.serviceDays)}</td></tr>
  <tr><td>المدة التي لم يخدم مقابلها</td><td>${fmtDur(result.unservedYears,result.unservedMonths,result.unservedDays)}</td></tr>
  <tr><td>المستحق على المبتعث</td><td>${fmtKWD(result.totalKWD)} × 50% × ${result.unservedTotal.toFixed(3)} / ${result.missionTotal.toFixed(3)}</td></tr>
</table>
<div class="result-box"><span class="label">إجمالي المديونية بعد تطبيق المادة (33)</span><span class="amount">${fmtKWD(result.totalDebt)}</span></div>
</div>
<div class="stamp-area">توقيع المختص &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; الختم الرسمي</div>
<div class="footer"><span>نظام الحسابات المالية — ديوان الخدمة المدنية</span><span>تاريخ الطباعة: ${new Date().toLocaleDateString("ar-KW")}</span></div>
</body></html>`;
}

function generateCashPDF(data, result, savedAt) {
  const monthRows = MONTHS_AR.map((month,i) => {
    const d=parseInt(data.monthDays?.[i])||0;
    if(d===0) return "";
    return `<tr><td>${month}</td><td>${d} يوم</td><td>${result.monthAmounts[i].toLocaleString("ar-KW",{minimumFractionDigits:3,maximumFractionDigits:3})} د.ك</td></tr>`;
  }).filter(Boolean).join("");
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"/>
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Arabic:wght@400;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'IBM Plex Arabic',Arial,sans-serif;direction:rtl;background:#fff;color:#1a202c;padding:32px;}
.header{background:linear-gradient(135deg,#0891b2,#0e7490);color:#fff;border-radius:12px;padding:24px 32px;margin-bottom:28px;display:flex;justify-content:space-between;align-items:center;}
.header h1{font-size:22px;font-weight:700;} .header .sub{font-size:12px;opacity:0.8;margin-top:4px;}
.meta{display:flex;gap:16px;margin-bottom:24px;}
.meta-box{flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;}
.meta-box label{font-size:11px;color:#64748b;font-weight:600;display:block;margin-bottom:4px;}
.meta-box span{font-size:15px;font-weight:700;color:#1a202c;}
.section{margin-bottom:24px;}
.section-title{font-size:13px;font-weight:700;color:#0891b2;border-bottom:2px solid #0891b2;padding-bottom:6px;margin-bottom:14px;}
table{width:100%;border-collapse:collapse;}
thead td{background:#f0f9ff;font-weight:700;color:#0891b2;font-size:12px;padding:10px 14px;border-bottom:2px solid #bae6fd;}
td{padding:9px 14px;font-size:13px;border-bottom:1px solid #f1f5f9;}
.summary-table td:first-child{color:#64748b;width:55%;} .summary-table td:last-child{font-weight:600;text-align:left;}
.totals-row{background:#f0f9ff;font-weight:700;}
.result-box{background:linear-gradient(135deg,#0891b218,#0891b208);border:2px solid #0891b240;border-radius:10px;padding:16px 20px;margin-top:20px;display:flex;justify-content:space-between;align-items:center;}
.result-box .label{font-size:14px;color:#475569;} .result-box .amount{font-size:24px;font-weight:700;color:#0891b2;}
.footer{margin-top:32px;border-top:1px solid #e2e8f0;padding-top:16px;display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;}
.stamp-area{border:2px dashed #e2e8f0;border-radius:8px;padding:24px;text-align:center;color:#cbd5e1;font-size:12px;margin-top:20px;}
@media print{body{padding:20px;}}
</style></head><body>
<div class="header"><div><div class="sub">ديوان الخدمة المدنية — المديريات المالية</div><h1>نموذج حساب البدل النقدي</h1></div><div style="font-size:40px">💵</div></div>
<div class="meta">
  <div class="meta-box"><label>الاسم الكامل</label><span>${data.name||"—"}</span></div>
  <div class="meta-box"><label>الرقم المدني</label><span>${data.civilId||"—"}</span></div>
  <div class="meta-box"><label>الراتب الأساسي</label><span>${fmtKWD(parseFloat(data.salary)||0)}</span></div>
  <div class="meta-box"><label>إجمالي الأيام</label><span>${result.totalDays} يوم</span></div>
</div>
<div class="section"><div class="section-title">تفصيل أيام وقيمة الاستحقاق</div>
<table><thead><tr><td>الشهر</td><td>عدد الأيام</td><td>مبلغ الاستحقاق</td></tr></thead>
<tbody>${monthRows}<tr class="totals-row"><td>الإجمالي</td><td>${result.totalDays} يوم</td><td>${result.totalAmount.toLocaleString("ar-KW",{minimumFractionDigits:3})} د.ك</td></tr></tbody>
</table></div>
<div class="section"><div class="section-title">الملخص المالي</div>
<table class="summary-table">
  <tr><td>إجمالي مبلغ الاستحقاق</td><td>${fmtKWD(result.totalAmount)}</td></tr>
  ${result.deductions>0?`<tr><td>الاستقطاعات</td><td>(${fmtKWD(result.deductions)})</td></tr>`:""}
  ${result.custody>0?`<tr><td>عهد تحت التحصيل</td><td>(${fmtKWD(result.custody)})</td></tr>`:""}
</table>
<div class="result-box"><span class="label">صافي المستحق</span><span class="amount">${fmtKWD(result.netDue)}</span></div>
</div>
<div class="stamp-area">توقيع المختص &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; الختم الرسمي</div>
<div class="footer"><span>نظام الحسابات المالية — ديوان الخدمة المدنية</span><span>تاريخ الطباعة: ${new Date().toLocaleDateString("ar-KW")}</span></div>
</body></html>`;
}

function exportPDF(htmlContent) {
  const win = window.open("","_blank","width=900,height=700");
  if(!win){alert("يرجى السماح بالنوافذ المنبثقة");return;}
  win.document.write(htmlContent); win.document.close(); win.focus();
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
      <input className="num-input" type={type} value={value} placeholder={placeholder||""} onChange={e=>onChange(e.target.value)}
        style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,color:C.textPrimary,
          fontSize:14,padding:"8px 12px",fontFamily:type==="number"?"JetBrains Mono,monospace":"inherit",width:"100%"}}/>
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
const dftDebt={name:"",civilId:"",amountDiwan:"",amountAttache:"",exchangeRate:"",
  missionStartDay:"",missionStartMonth:"",missionStartYear:"",
  missionEndDay:"",missionEndMonth:"",missionEndYear:"",returnMonth:"",
  serviceStartDay:"",serviceStartMonth:"",serviceStartYear:"",
  serviceEndDay:"",serviceEndMonth:"",serviceEndYear:""};

function DebtForm({initial,onSave,onCancel,color,saving}){
  const [d,setD]=useState(initial||dftDebt);
  const set=k=>v=>setD(p=>({...p,[k]:v}));
  const res=calcDebt(d);
  const fmt=n=>(!n||isNaN(n)||n===0)?"—":n.toLocaleString("ar-KW",{minimumFractionDigits:3,maximumFractionDigits:3})+" د.ك";
  const fmtM=(y,m,dd)=>`${y||0} سنة ${m||0} شهر ${dd||0} يوم`;
  return(
    <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:20}}>
      <Card><SecHead title="البيانات الشخصية" color={color} icon="👤"/>
        <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
          <Field label="الاسم الكامل" value={d.name} onChange={set("name")} wide placeholder="أدخل الاسم"/>
          <Field label="الرقم المدني" value={d.civilId} onChange={set("civilId")} placeholder="12 رقم"/>
        </div>
      </Card>
      <Card><SecHead title="المبالغ المالية" color={color} icon="💰"/>
        <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
          <Field label="مبالغ الديوان (د.ك)" type="number" value={d.amountDiwan} onChange={set("amountDiwan")}/>
          <Field label="مبالغ الملحق الثقافي ($)" type="number" value={d.amountAttache} onChange={set("amountAttache")}/>
          <Field label="سعر الصرف" type="number" value={d.exchangeRate} onChange={set("exchangeRate")} placeholder="0.336924"/>
        </div>
        {res.totalKWD>0&&<div style={{marginTop:12}}><ResBox label="إجمالي المبلغ بالدينار الكويتي" value={fmt(res.totalKWD)} color={color}/></div>}
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
          {res.missionTotal>0&&<ResBox label="مدة البعثة" value={fmtM(res.missionYears,res.missionMonths,res.missionDays)} color={color}/>}
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
          {res.serviceTotal>0&&<ResBox label="مدة الخدمة" value={fmtM(res.serviceYears,res.serviceMonths,res.serviceDays)} color={color}/>}
        </div>
      </Card>
      {res.totalKWD>0&&res.missionTotal>0&&(
        <Card style={{border:`1px solid ${color}40`,background:`linear-gradient(135deg,${color}10,${C.surface})`}}>
          <SecHead title="نتائج الحساب" color={color} icon="📊"/>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <ResBox label="المدة التي لم يخدم مقابلها" value={fmtM(res.unservedYears,res.unservedMonths,res.unservedDays)} color={C.gold}/>
            <div style={{height:1,background:C.border}}/>
            <ResBox label="إجمالي المديونية بعد تطبيق المادة (33)" value={fmt(res.totalDebt)} color={color} large/>
          </div>
        </Card>
      )}
      <div style={{display:"flex",gap:10,justifyContent:"flex-end",flexWrap:"wrap"}}>
        {onCancel&&<Btn outline onClick={onCancel}>إلغاء</Btn>}
        <Btn gold onClick={()=>exportPDF(generateDebtPDF(d,res,new Date().toLocaleDateString("ar-KW")))}>🖨️ طباعة / PDF</Btn>
        <Btn color={color} onClick={()=>onSave(d,res)}>{saving?<span>⏳ جاري الحفظ...</span>:"💾 حفظ السجل"}</Btn>
      </div>
    </div>
  );
}

// ==================== CASH FORM ====================
const dftCash={name:"",civilId:"",salary:"",monthDays:Array(12).fill(""),deductions:"",custody:""};

function CashForm({initial,onSave,onCancel,color,saving}){
  const [d,setD]=useState(initial||{...dftCash,monthDays:Array(12).fill("")});
  const set=k=>v=>setD(p=>({...p,[k]:v}));
  const setM=i=>v=>setD(p=>{const a=[...p.monthDays];a[i]=v;return{...p,monthDays:a};});
  const res=calcCash(d);
  const fmt=n=>(!n||isNaN(n)||!isFinite(n))?"—":n.toLocaleString("ar-KW",{minimumFractionDigits:3,maximumFractionDigits:3})+" د.ك";
  const hasData=res.totalDays>0;
  return(
    <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:20}}>
      <Card><SecHead title="البيانات الشخصية" color={color} icon="👤"/>
        <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
          <Field label="الاسم الكامل" value={d.name} onChange={set("name")} wide placeholder="أدخل الاسم"/>
          <Field label="الرقم المدني" value={d.civilId} onChange={set("civilId")}/>
          <Field label="الراتب الأساسي (د.ك)" type="number" value={d.salary} onChange={set("salary")}/>
        </div>
      </Card>
      <Card><SecHead title="تفصيل أيام الاستحقاق" color={color} icon="📆"/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
          {MONTHS_AR.map((month,i)=>{
            const active=(parseInt(d.monthDays[i])||0)>0;
            return(
              <div key={i} style={{background:active?`${color}12`:C.bg,border:`1px solid ${active?color+"40":C.border}`,borderRadius:10,padding:"10px 12px",transition:"all 0.2s"}}>
                <div style={{fontSize:11,color:C.textMuted,marginBottom:6,fontWeight:600}}>{month}</div>
                <input className="num-input" type="number" value={d.monthDays[i]} onChange={e=>setM(i)(e.target.value)} placeholder="0" min={0} max={31}
                  style={{background:"transparent",border:"none",color:active?color:C.textPrimary,fontSize:18,fontWeight:700,width:"100%",fontFamily:"JetBrains Mono,monospace"}}/>
                {res.monthAmounts[i]>0&&<div style={{fontSize:10,color:C.textMuted,marginTop:4}}>{res.monthAmounts[i].toLocaleString("ar-KW",{maximumFractionDigits:2})} د.ك</div>}
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
        <Btn gold onClick={()=>exportPDF(generateCashPDF(d,res,new Date().toLocaleDateString("ar-KW")))}>🖨️ طباعة / PDF</Btn>
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
            <div style={{fontSize:15,fontWeight:700,color:C.textPrimary}}>{rec.name||rec.data?.name||"بدون اسم"}</div>
            <div style={{fontSize:12,color:C.textMuted}}>{rec.civil_id||rec.data?.civilId||"—"} • {new Date(rec.saved_at||rec.created_at).toLocaleDateString("ar-KW")}</div>
            <div style={{fontSize:13,color,fontFamily:"JetBrains Mono",fontWeight:600}}>
              {type==="debt"
                ?(rec.result?.totalDebt>0?rec.result.totalDebt.toLocaleString("ar-KW",{maximumFractionDigits:3})+" د.ك":"—")
                :(rec.result?.netDue>0?rec.result.netDue.toLocaleString("ar-KW",{maximumFractionDigits:3})+" د.ك":"—")}
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
      const payload={name:data.name,civil_id:data.civilId,data,result,saved_at:new Date().toISOString()};
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
      ?generateDebtPDF(rec.data,rec.result,new Date(rec.saved_at).toLocaleDateString("ar-KW"))
      :generateCashPDF(rec.data,rec.result,new Date(rec.saved_at).toLocaleDateString("ar-KW"));
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
                  <div style={{fontSize:18,fontWeight:800,color:t.color,fontFamily:"JetBrains Mono"}}>{counts[t.k]}</div>
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
