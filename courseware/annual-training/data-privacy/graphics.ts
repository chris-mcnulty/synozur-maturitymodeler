/** Editable artwork for the Data Privacy annual training course. */
import path from "node:path";
import { BRAND, LOGO_FILES, baseCss, dataUri, page, renderPdf, renderPng } from "../shared/render";

export const MEDIA_DIR = path.resolve(import.meta.dirname, "media");

const escapeHtml = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[c]!);

async function hero(): Promise<string> {
  const logo = await dataUri(LOGO_FILES.horizontal);
  return page(1600, 900, `
    body{position:relative;background:#FBF9FF}
    .stripe{position:absolute;top:0;right:0;width:545px;height:900px;background:linear-gradient(150deg,${BRAND.purple},${BRAND.magenta});clip-path:polygon(40% 0,100% 0,100% 100%,0 100%)}
    .orb{position:absolute;border:3px solid rgba(255,255,255,.36);border-radius:50%}
    .a{width:700px;height:700px;right:-258px;top:75px}.b{width:520px;height:520px;right:-168px;top:160px}.c{width:330px;height:330px;right:-72px;top:255px}
    .logo{position:absolute;left:96px;top:75px;width:355px}
    .label{position:absolute;left:100px;top:282px;font-size:27px;color:${BRAND.purple};font-weight:700;letter-spacing:4px}
    h1{position:absolute;left:92px;top:345px;width:1030px;font-size:87px;line-height:1.07;font-weight:700;letter-spacing:-2px}
    .sub{position:absolute;left:100px;top:690px;font-size:38px;font-weight:600;color:${BRAND.muted}}
    .bar{position:absolute;left:100px;bottom:81px;width:230px;height:10px;background:${BRAND.magenta};border-radius:10px}
  `, `<div class="stripe"></div><div class="orb a"></div><div class="orb b"></div><div class="orb c"></div>
    <img class="logo" src="${logo}" alt="Synozur Alliance"><div class="label">ANNUAL TRAINING</div>
    <h1>Data Privacy and<br>Client Confidentiality</h1><div class="sub">Protect people. Respect client trust.</div><div class="bar"></div>`);
}

async function poster(): Promise<string> {
  const logo = await dataUri(LOGO_FILES.horizontal);
  return page(1600, 900, `
    body{position:relative;background:#fff}
    .panel{position:absolute;right:0;top:0;width:615px;height:900px;background:linear-gradient(145deg,${BRAND.purple},${BRAND.magenta});clip-path:polygon(24% 0,100% 0,100% 100%,0 100%)}
    .orb{position:absolute;right:-100px;top:210px;width:560px;height:560px;border-radius:50%;border:4px solid rgba(255,255,255,.24);box-shadow:0 0 0 65px rgba(255,255,255,.07),0 0 0 130px rgba(255,255,255,.05)}
    .play{position:absolute;right:173px;top:345px;width:190px;height:190px;border-radius:50%;background:#fff;display:grid;place-items:center;box-shadow:0 20px 70px rgba(28,21,48,.2)}
    .play:after{content:"";border-top:36px solid transparent;border-bottom:36px solid transparent;border-left:56px solid ${BRAND.purple};margin-left:12px}
    .logo{position:absolute;left:96px;top:80px;width:350px}
    .label{position:absolute;left:100px;top:280px;color:${BRAND.purple};font-weight:700;letter-spacing:3px;font-size:25px}
    h1{position:absolute;left:95px;top:340px;width:820px;font-weight:700;font-size:76px;line-height:1.1}
    .name{position:absolute;left:100px;top:560px;font-size:34px;font-weight:600;color:${BRAND.muted}}
    .badge{position:absolute;left:96px;top:665px;padding:20px 30px;border-radius:16px;background:${BRAND.ink};color:#fff;font-size:32px;font-weight:700}
  `, `<div class="panel"></div><div class="orb"></div><div class="play"></div>
    <img class="logo" src="${logo}" alt="Synozur Alliance"><div class="label">DATA PRIVACY · ANNUAL TRAINING</div>
    <h1>A welcome from<br>Chris McNulty</h1><div class="name">Introduction to the course</div>
    <div class="badge">Introduction video coming soon</div>`);
}

function overlap(): string {
  return page(1600, 900, `
    body{position:relative;background:#FCFAFF}
    .kicker{position:absolute;left:70px;top:45px;color:${BRAND.purple};font-size:22px;font-weight:700;letter-spacing:3px}
    h1{position:absolute;left:70px;top:80px;font-size:48px;font-weight:700}
    .circle{position:absolute;top:188px;width:750px;height:570px;border-radius:50%;padding-top:85px}
    .left{left:76px;background:rgba(129,15,251,.11);border:4px solid ${BRAND.purple};padding-left:126px}
    .right{right:76px;background:rgba(230,12,179,.11);border:4px solid ${BRAND.magenta};padding-left:290px}
    h2{font-size:43px;line-height:1.15;font-weight:700}
    .left h2{color:#6410BB}.right h2{color:#A10C82}
    .sub{font-size:25px;font-weight:600;margin:8px 0 24px}
    ul{list-style:none;width:340px}
    li{font-size:24px;line-height:1.3;margin:0 0 17px;padding-left:22px;position:relative}
    li:before{content:"";position:absolute;left:0;top:12px;width:8px;height:8px;border-radius:50%;background:currentColor}
    .both{position:absolute;left:649px;top:305px;width:302px;text-align:center;background:#fff;border:3px solid ${BRAND.ink};border-radius:24px;padding:24px 18px;box-shadow:0 12px 30px rgba(28,21,48,.14)}
    .both h2{font-size:38px;color:${BRAND.ink}}.both p{font-size:21px;line-height:1.32;margin-top:12px}.both small{font-size:19px;display:block;color:${BRAND.muted};margin-top:12px;line-height:1.25}
    footer{position:absolute;bottom:42px;left:70px;right:70px;padding:20px 25px;border-radius:16px;background:${BRAND.ink};color:#fff;font-size:24px;font-weight:600;text-align:center}
  `, `<div class="kicker">KNOW WHAT YOU'RE PROTECTING</div><h1>Privacy and confidentiality overlap</h1>
    <div class="circle left"><h2>Privacy</h2><p class="sub">protects people</p><ul><li>names and contact details</li><li>employee records</li><li>recordings and images of people</li></ul></div>
    <div class="circle right"><h2>Confidentiality</h2><p class="sub">protects nonpublic information</p><ul><li>client plans and pricing</li><li>proposals and deliverables</li><li>workshop discussions</li></ul></div>
    <div class="both"><h2>Both</h2><p>personal information inside client materials</p><small>e.g., an employee list in a client workshop file</small></div>
    <footer>Either way: use it only for the authorized purpose, share it only with people who need it.</footer>`);
}

function lifecycle(): string {
  const stages = [
    ["Collect", "only the fields the task needs"],
    ["Use", "for the authorized purpose"],
    ["Share", "verified recipients, approved route"],
    ["Store", "approved workspace and classification"],
    ["Retain", "per the approved retention schedule"],
    ["Dispose", "approved method, when the schedule allows"],
  ];
  return page(1600, 900, `
    body{background:#FCFAFF;position:relative}
    .kicker{position:absolute;left:70px;top:45px;color:${BRAND.purple};font-size:22px;font-weight:700;letter-spacing:3px}
    h1{position:absolute;left:70px;top:82px;font-size:49px}
    .line{position:absolute;left:120px;right:120px;top:294px;height:7px;background:linear-gradient(90deg,${BRAND.purple},${BRAND.magenta});border-radius:5px}
    .steps{position:absolute;left:60px;right:60px;top:213px;display:grid;grid-template-columns:repeat(6,1fr);gap:13px}
    .stage{height:388px;background:#fff;border:2px solid ${BRAND.line};border-radius:23px;padding:22px 20px;box-shadow:0 10px 28px rgba(28,21,48,.06);position:relative}
    .num{height:106px;width:106px;border-radius:50%;background:${BRAND.purple};color:#fff;font-size:51px;font-weight:700;display:grid;place-items:center;border:6px solid #fff;box-shadow:0 0 0 2px ${BRAND.purple};margin:0 auto 28px}
    .stage:nth-child(n+5) .num{background:${BRAND.magenta};box-shadow:0 0 0 2px ${BRAND.magenta}}
    .stage h2{text-align:center;font-size:33px;margin-bottom:17px}
    .stage p{font-size:24px;line-height:1.25;text-align:center;color:#393249}
    .hold{position:absolute;left:1037px;right:60px;top:638px;border-radius:18px;background:${BRAND.ink};color:#fff;padding:20px 25px;font-size:19px;line-height:1.35}
    .hold b{color:#F9B5E8;font-size:24px}
    .rule{position:absolute;left:1068px;right:90px;top:606px;height:18px;border:4px solid ${BRAND.magenta};border-top:0;border-radius:0 0 9px 9px}
    .foot{position:absolute;left:70px;bottom:72px;width:870px;font-size:27px;font-weight:600;color:${BRAND.muted}}
  `, `<div class="kicker">FROM START TO FINISH</div><h1>The data lifecycle: six decisions</h1><div class="line"></div>
    <div class="steps">${stages.map(([name, guidance], i) => `<div class="stage"><div class="num">${i + 1}</div><h2>${name}</h2><p>${guidance}</p></div>`).join("")}</div>
    <div class="rule"></div><div class="hold"><b>Legal hold</b><br>Don't delete or change records under hold, even if a request or the schedule says otherwise. Ask the legal-hold contact.</div>
    <div class="foot">Use approved processes at every stage.</div>`);
}

function minimization(): string {
  const before = [
    ["Jordan Avery", "jordan.avery@example.com", "E-1042", "Treasury", "Lisbon", "Analyst", "Jordan noted a late start."],
    ["Morgan Vale", "morgan.vale@example.com", "E-1087", "Treasury", "Lisbon", "Manager", "Morgan liked the exercise."],
    ["Casey Rowan", "casey.rowan@example.com", "E-2156", "Operations", "Porto", "Lead", "Casey asked for more time."],
    ["Taylor Quinn", "taylor.quinn@example.com", "E-3091", "Product", "Madrid", "Specialist", "Taylor valued discussion."],
  ];
  const after = [
    ["Treasury", "[name removed] noted a late start."],
    ["Treasury", "[name removed] liked the exercise."],
    ["Operations", "[name removed] asked for more time."],
    ["Product", "[name removed] valued discussion."],
  ];
  const table = (headers: string[], rows: string[][], className: string) =>
    `<table class="${className}"><thead><tr>${headers.map(x => `<th>${escapeHtml(x)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(x => `<td>${escapeHtml(x)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  return page(1600, 1000, `
    body{background:#FCFAFF;position:relative;padding:37px 48px}
    .tag{display:inline-block;background:${BRAND.ink};color:#fff;border-radius:40px;padding:9px 19px;font-weight:700;font-size:18px;letter-spacing:2px}
    h1{font-size:46px;margin:16px 0 8px}
    .task{font-size:25px;color:${BRAND.muted};margin-bottom:25px}
    .layout{display:grid;grid-template-columns:1125px 360px;gap:20px}
    .section{background:#fff;border-radius:18px;border:2px solid ${BRAND.line};padding:16px 19px 18px;margin-bottom:14px}
    .section h2{font-size:29px;margin-bottom:12px}
    .section h2 em{font-size:19px;color:${BRAND.muted};font-weight:400;font-style:normal}
    table{width:100%;table-layout:fixed;border-collapse:collapse}
    th,td{text-align:left;vertical-align:top;overflow-wrap:anywhere;border-bottom:1px solid ${BRAND.line};padding:8px 8px;font-size:17px;line-height:1.25}
    th{font-weight:700;background:${BRAND.lilac};color:#55109B}
    td{color:#302844}
    tbody tr:last-child td{border-bottom:none}
    .before th:nth-child(1){width:12%}.before th:nth-child(2){width:24%}.before th:nth-child(3){width:12%}.before th:nth-child(4){width:12%}.before th:nth-child(5){width:10%}.before th:nth-child(6){width:11%}.before th:nth-child(7){width:19%}
    .after th{background:${BRAND.blush};color:#A10C82}
    .after th:first-child{width:23%}
    aside{border-radius:18px;background:${BRAND.ink};color:#fff;padding:26px 23px}
    aside h2{font-size:29px;line-height:1.15;margin-bottom:23px}
    aside .item{margin-bottom:25px;font-size:21px;line-height:1.34}
    aside .n{display:inline-grid;place-items:center;border-radius:50%;background:${BRAND.magenta};font-size:20px;font-weight:700;width:35px;height:35px;margin-bottom:8px}
    footer{position:absolute;left:48px;right:48px;bottom:27px;background:${BRAND.blush};border-left:6px solid ${BRAND.magenta};padding:17px 23px;font-size:22px;line-height:1.3;font-weight:600}
  `, `<div class="tag">FICTIONAL TRAINING EXAMPLE</div><h1>Keep only what the task needs</h1>
    <p class="task"><b>Task:</b> summarize themes from a client workshop feedback survey.</p>
    <div class="layout"><div><section class="section"><h2>BEFORE <em>· export as received</em></h2>${table(["Name", "Work email", "Employee ID", "Department", "Location", "Role level", "Feedback comment"], before, "before")}</section>
    <section class="section"><h2>AFTER <em>· minimum needed</em></h2>${table(["Department", "Feedback comment"], after, "after")}</section></div>
    <aside><h2>Still identifiable?</h2>
      <div class="item"><span class="n">1</span><br>Small groups: a two-person team in one office points to specific people.</div>
      <div class="item"><span class="n">2</span><br>Free-text comments can mention names, projects, or unique events.</div>
      <div class="item"><span class="n">3</span><br>Combining with other data (org charts, meeting notes) can re-identify people.</div>
    </aside></div><footer>Removing names reduces risk but doesn't guarantee anonymity. Check the client's instructions before reusing.</footer>`);
}

/** The lesson export is loaded only at PDF-render time so artwork can render first. */
async function quickReferenceHtml(): Promise<string | null> {
  let content: Record<string, unknown>;
  try {
    content = await import("./content");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND" ||
        String(error).includes("Cannot find module")) return null;
    throw error;
  }
  if (!("BEFORE_YOU_SHARE" in content)) return null;
  const source = content.BEFORE_YOU_SHARE as {
    title: string; intro: string;
    checklist: { label: string; detail: string }[];
    routes: { need: string; contact: string }[];
    caveat: string;
  };
  const logo = await dataUri(LOGO_FILES.horizontal);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Before you share · Data Privacy (Draft)</title><style>${baseCss()}
    @page{size:Letter;margin:0}
    body{width:816px;height:1056px;position:relative;overflow:hidden;background:#fff}
    .wm{position:absolute;left:50%;top:52%;transform:translate(-50%,-50%) rotate(-32deg);font-size:125px;font-weight:700;letter-spacing:12px;color:rgba(129,15,251,.07);z-index:0}
    header{height:135px;background:linear-gradient(110deg,${BRAND.purple},${BRAND.magenta});padding:30px 43px;display:flex;align-items:center;justify-content:space-between;color:#fff}
    .logo{background:#fff;border-radius:10px;padding:11px 15px}.logo img{height:39px;display:block}
    header h1{font-size:34px}header p{font-size:15px}
    .draft{background:${BRAND.ink};color:#fff;font-size:12px;font-weight:600;letter-spacing:1.5px;padding:9px 43px}
    main{position:relative;z-index:1;padding:20px 44px;font-size:12.6px;line-height:1.32}
    main h2{font-size:18px;color:${BRAND.purple};margin:14px 0 7px}
    .intro{font-size:14px;line-height:1.35;margin:0 0 12px}
    ol{list-style:none;counter-reset:item}
    ol li{counter-increment:item;position:relative;padding:0 0 9px 32px;min-height:27px}
    ol li:before{content:counter(item);position:absolute;left:0;top:0;background:${BRAND.purple};color:#fff;width:23px;height:23px;display:grid;place-items:center;border-radius:50%;font-weight:700}
    table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:11.4px}
    th,td{padding:8px 10px;border-bottom:1px solid ${BRAND.line};text-align:left;vertical-align:top;overflow-wrap:anywhere}
    th{background:${BRAND.lilac};font-weight:700}th:first-child{width:42%}
    .caveat{background:${BRAND.blush};padding:9px 12px;border-left:4px solid ${BRAND.magenta};margin-top:12px}
    footer{position:absolute;left:44px;right:44px;bottom:22px;border-top:1px solid ${BRAND.line};padding-top:8px;color:${BRAND.muted};font-size:11px}
  </style></head><body><div class="wm" aria-hidden="true">DRAFT</div>
    <header><div class="logo"><img src="${logo}" alt="Synozur Alliance"></div><div><h1>${escapeHtml(source.title)}</h1><p>Data privacy · annual training reference</p></div></header>
    <div class="draft">DRAFT · NOT FOR RELEASE · CONTACTS PENDING VERIFICATION</div><main>
      <p class="intro">${escapeHtml(source.intro)}</p><h2>Before you share: check</h2>
      <ol>${source.checklist.map(x => `<li><b>${escapeHtml(x.label)}:</b> ${escapeHtml(x.detail)}</li>`).join("")}</ol>
      <h2>Contacts and routes</h2>
      <table><thead><tr><th>For</th><th>Route</th></tr></thead><tbody>${source.routes.map(x => `<tr><td>${escapeHtml(x.need)}</td><td>${escapeHtml(x.contact)}</td></tr>`).join("")}</tbody></table>
      <p class="caveat">${escapeHtml(source.caveat)}</p></main>
    <footer>Synozur Data Privacy and Client Confidentiality · Course resource</footer></body></html>`;
}

export const GRAPHICS = {
  hero: { file: "hero.jpg", width: 1600, height: 900, build: hero },
  poster: { file: "welcome-poster.jpg", width: 1600, height: 900, build: poster },
  overlap: { file: "privacy-confidentiality-overlap.png", width: 1600, height: 900, build: overlap },
  lifecycle: { file: "data-lifecycle.png", width: 1600, height: 900, build: lifecycle },
  minimization: { file: "minimization-before-after.png", width: 1600, height: 1000, build: minimization },
} as const;

export const QUICK_REFERENCE_FILE = "before-you-share-data-privacy.pdf";

export async function renderAll(): Promise<void> {
  for (const graphic of Object.values(GRAPHICS)) {
    await renderPng({ html: await graphic.build(), out: path.join(MEDIA_DIR, graphic.file), width: graphic.width, height: graphic.height, scale: 1 });
  }
  const html = await quickReferenceHtml();
  if (html === null) {
    console.log("Skipping before-you-share-data-privacy.pdf: content.ts does not yet export BEFORE_YOU_SHARE.");
    return;
  }
  await renderPdf({ html, out: path.join(MEDIA_DIR, QUICK_REFERENCE_FILE) });
}