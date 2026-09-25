/** Editable artwork for the Business Conduct annual training course. */
import path from "node:path";
import { BRAND, LOGO_FILES, baseCss, dataUri, page, renderPdf, renderPng } from "../shared/render";

export const MEDIA_DIR = path.resolve(import.meta.dirname, "media");

const escapeHtml = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[c]!);

async function hero(): Promise<string> {
  const logo = await dataUri(LOGO_FILES.horizontal);
  const checks = ["Permission", "Honesty", "Fairness", "Authority", "Explainability"];
  return page(1600, 900, `
    body{position:relative;background:#FBF9FF}
    .gradient{position:absolute;right:0;top:0;width:610px;height:900px;background:linear-gradient(145deg,${BRAND.purple},${BRAND.magenta});clip-path:polygon(19% 0,100% 0,100% 100%,0 100%)}
    .ring{position:absolute;right:-300px;top:-210px;width:780px;height:780px;border:3px solid rgba(255,255,255,.28);border-radius:50%;box-shadow:0 0 0 95px rgba(255,255,255,.07),0 0 0 190px rgba(255,255,255,.06)}
    .logo-panel{position:absolute;left:94px;top:74px;background:#fff;border-radius:18px;padding:14px 19px;box-shadow:0 8px 25px rgba(28,21,48,.07)}
    .logo{display:block;width:315px}
    .eyebrow{position:absolute;left:100px;top:252px;color:${BRAND.purple};font-size:27px;font-weight:700;letter-spacing:3px}
    h1{position:absolute;left:94px;top:311px;width:920px;font-size:82px;line-height:1.11;letter-spacing:-2px}
    .subtitle{position:absolute;left:100px;top:560px;font-size:37px;font-weight:600;color:${BRAND.muted}}
    .checklist{position:absolute;left:94px;bottom:95px;display:flex;gap:12px}
    .check{display:flex;align-items:center;gap:9px;padding:17px 16px;border-radius:14px;background:#fff;border:2px solid ${BRAND.line};font-size:21px;font-weight:700;box-shadow:0 8px 22px rgba(28,21,48,.05)}
    .check span{display:grid;place-items:center;width:25px;height:25px;border-radius:50%;background:${BRAND.purple};color:#fff;font-size:17px}
  `, `<div class="gradient"></div><div class="ring"></div><div class="logo-panel"><img class="logo" src="${logo}" alt="Synozur Alliance"></div>
    <div class="eyebrow">ANNUAL TRAINING</div><h1>Standards of<br>Business Conduct</h1><div class="subtitle">The five-question decision test</div>
    <div class="checklist">${checks.map(x => `<div class="check"><span>✓</span>${x}</div>`).join("")}</div>`);
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
    <img class="logo" src="${logo}" alt="Synozur Alliance"><div class="label">BUSINESS CONDUCT · ANNUAL TRAINING</div>
    <h1>A welcome from<br>Chris McNulty</h1><div class="name">Introduction to the course</div>
    <div class="badge">Introduction video coming soon</div>`);
}

function recuse(): string {
  const steps = [
    ["01", "Disclose early, in writing, to your manager or the designated conduct contact"],
    ["02", "Step back from the decision while it's reviewed"],
    ["03", "The approver decides and records any safeguards"],
    ["04", "Continue only as directed"],
  ];
  return page(1600, 900, `
    body{background:#FCFAFF;position:relative;padding:35px 62px}
    .eyebrow{font-size:23px;font-weight:700;letter-spacing:3px;color:${BRAND.purple}}
    .status{position:absolute;right:62px;top:31px;padding:10px 17px;border-radius:9px;background:${BRAND.blush};border:2px solid ${BRAND.magenta};color:#941274;font-size:18px;font-weight:700;letter-spacing:1px}
    h1{font-size:57px;margin:5px 0 16px}
    .question{border-radius:20px;background:${BRAND.ink};color:#fff;padding:25px 34px;font-size:33px;line-height:1.22;font-weight:600}
    .fork{height:52px;position:relative;margin:0 240px}
    .fork:before{content:"";position:absolute;left:18%;right:18%;top:23px;border-top:4px solid ${BRAND.purple}}
    .fork:after{content:"";position:absolute;left:50%;top:0;height:24px;border-left:4px solid ${BRAND.purple}}
    .fork span{position:absolute;top:22px;height:30px;border-left:4px solid ${BRAND.purple}}
    .fork span:first-child{left:18%}.fork span:last-child{right:18%}
    .fork span:after{content:"";position:absolute;bottom:-1px;left:-10px;border-left:8px solid transparent;border-right:8px solid transparent;border-top:11px solid ${BRAND.purple}}
    .branches{display:grid;grid-template-columns:1fr 1fr;gap:26px}
    .branch{border-radius:17px;background:#fff;border:2px solid ${BRAND.line};padding:16px 27px;min-height:122px}
    .branch.yes{border-color:${BRAND.purple};background:#F9F4FF}
    .branch h2{font-size:32px;color:${BRAND.purple};line-height:1.1;margin-bottom:7px}
    .branch p{font-size:30px;font-weight:600;line-height:1.22}
    .to-steps{height:51px;position:relative;margin-left:75%;width:4px;background:${BRAND.purple}}
    .to-steps:after{content:"";position:absolute;bottom:0;left:-8px;border-left:10px solid transparent;border-right:10px solid transparent;border-top:13px solid ${BRAND.purple}}
    .steps{display:grid;grid-template-columns:1.3fr 1fr 1fr 1fr;gap:30px}
    .step{position:relative;background:#fff;border-radius:15px;border:2px solid ${BRAND.line};padding:17px 18px;height:260px;font-size:30px;font-weight:600;line-height:1.17}
    .step:not(:last-child):after{content:"➜";position:absolute;right:-31px;top:104px;width:29px;text-align:center;color:${BRAND.purple};font-size:28px;font-weight:700}
    .num{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:${BRAND.purple};color:#fff;font-size:20px;font-weight:700;margin-bottom:9px}
    .note{margin-top:17px;background:${BRAND.blush};border-left:7px solid ${BRAND.magenta};border-radius:12px;padding:16px 23px;font-size:25px;line-height:1.25;font-weight:600}
  `, `<div class="eyebrow">WHEN AN INTEREST MAY CROSS A DECISION</div><div class="status">PROPOSED — PENDING APPROVAL</div><h1>Disclose and recuse</h1>
    <div class="question">Could a relationship, outside interest, gift, or hospitality affect a decision you're part of, or look as if it does?</div>
    <div class="fork"><span></span><span></span></div>
    <div class="branches"><div class="branch no"><h2>No</h2><p>Proceed. Check again if anything changes.</p></div>
    <div class="branch yes"><h2>Yes or unsure</h2></div></div>
    <div class="to-steps"></div><div class="steps">${steps.map(([n, text]) => `<div class="step"><span class="num">${n}</span><span>${text}</span></div>`).join("")}</div>
    <div class="note">No gift is too small to disclose if someone asks you to keep it secret. Gift and hospitality limits are pending policy approval.</div>`);
}

function correction(): string {
  return page(1600, 1000, `
    body{background:#FCFAFF;position:relative;padding:38px 55px}
    .tag{display:inline-block;background:${BRAND.ink};color:#fff;border-radius:30px;padding:9px 19px;font-size:18px;font-weight:700;letter-spacing:2px}
    h1{font-size:50px;margin:16px 0 8px}
    .intro{font-size:23px;color:${BRAND.muted};margin-bottom:24px}
    .panels{display:grid;grid-template-columns:1fr 1fr;gap:25px}
    .panel{border-radius:19px;background:#fff;border:2px solid ${BRAND.line};padding:24px 27px;height:654px}
    .bad{border-top:9px solid ${BRAND.magenta}}.good{border-top:9px solid ${BRAND.purple}}
    h2{font-size:33px;margin-bottom:18px}.bad h2{color:#A10C82}.good h2{color:#6410BB}
    .row{display:grid;grid-template-columns:152px 1fr;border-bottom:1px solid ${BRAND.line};padding:12px 0;font-size:22px;line-height:1.27}
    .row b{font-weight:700}.cross{text-decoration:line-through;text-decoration-thickness:2px;color:${BRAND.muted}}
    .subhead{font-size:18px;font-weight:700;letter-spacing:2px;color:${BRAND.muted};margin-top:22px}
    .changed{background:${BRAND.blush};border-radius:13px;padding:11px 17px;margin-top:9px}
    .right-note{background:${BRAND.lilac};border-radius:13px;padding:14px 17px;margin-top:14px;font-size:21px;line-height:1.3}
    .warning{margin-top:24px;font-size:23px;line-height:1.25;font-weight:600;color:#941274}
    .symbol{font-size:31px;vertical-align:middle;margin-right:5px}
    footer{position:absolute;bottom:32px;left:55px;right:55px;background:${BRAND.ink};color:#fff;border-radius:13px;text-align:center;font-size:26px;font-weight:600;padding:17px}
  `, `<div class="tag">FICTIONAL TRAINING EXAMPLE</div><h1>Correct a record without erasing its history</h1>
    <p class="intro">Synthetic timesheet · Sam Ortiz · week of 5 October 2026</p>
    <div class="panels">
      <section class="panel bad"><h2>Don't: overwrite or backdate</h2><div class="subhead">ORIGINAL ENTRY — ERASED</div>
        <div class="row"><b>Project</b><span>ASTER-02 silently replaced by BIRCH-07</span></div>
        <div class="row"><b>Hours</b><span>6.0 hours</span></div>
        <div class="row"><b>Approval</b><span>Original date changed from 6 Oct to 5 Oct</span></div>
        <div class="changed"><div class="subhead" style="margin-top:0">ONLY THE ALTERED ENTRY REMAINS</div>
          <div class="row"><b>Project</b><span>BIRCH-07</span></div><div class="row"><b>Approved</b><span>5 Oct 2026</span></div></div>
        <p class="warning"><span class="symbol">✕</span>No visible trail of what changed, when, or why.</p>
      </section>
      <section class="panel good"><h2>Do: correct with a visible trail</h2>
        <div class="subhead">ORIGINAL ENTRY — KEPT AND READABLE</div>
        <div class="row"><b>Project</b><span class="cross">ASTER-02 · 6.0 hours</span></div>
        <div class="row"><b>Approved</b><span>6 Oct 2026 (unchanged)</span></div>
        <div class="subhead">NEW CORRECTING ENTRY</div>
        <div class="row"><b>Project</b><span>BIRCH-07 · 6.0 hours</span></div>
        <div class="right-note"><b>Correction note</b><br>Who: Sam Ortiz · When: 8 Oct 2026 (actual correction date)<br>Why: Hours assigned to wrong project code.<br>Approver: timesheet approver (role).</div>
      </section>
    </div><footer>Correct records openly. Never backdate an approval or hide the original.</footer>`);
}

function routes(): string {
  return page(1600, 900, `
    body{background:#FCFAFF;position:relative;padding:38px 72px}
    .eyebrow{font-size:23px;font-weight:700;letter-spacing:3px;color:${BRAND.purple}}
    .status{position:absolute;right:72px;top:31px;padding:10px 17px;border-radius:9px;background:${BRAND.blush};border:2px solid ${BRAND.magenta};color:#941274;font-size:18px;font-weight:700;letter-spacing:1px}
    h1{font-size:59px;margin:5px 0 20px}
    .start{border-radius:20px;background:${BRAND.ink};color:#fff;padding:28px 36px;font-size:34px;font-weight:600;line-height:1.25}
    .fork{height:62px;position:relative}
    .fork:before{content:"";position:absolute;left:16.2%;right:16.2%;top:30px;border-top:4px solid ${BRAND.purple}}
    .fork:after{content:"";position:absolute;left:50%;top:0;height:31px;border-left:4px solid ${BRAND.purple}}
    .fork span{position:absolute;top:30px;height:32px;border-left:4px solid ${BRAND.purple}}
    .fork span:first-child{left:16.2%}.fork span:nth-child(2){left:50%}.fork span:last-child{right:16.2%;border-color:${BRAND.magenta}}
    .fork span:after{content:"";position:absolute;bottom:-1px;left:-10px;border-left:8px solid transparent;border-right:8px solid transparent;border-top:12px solid ${BRAND.purple}}
    .fork span:nth-child(2):after{border-top-color:${BRAND.purple}}
    .fork span:last-child:after{border-top-color:${BRAND.magenta}}
    .routes{display:grid;grid-template-columns:1fr 1fr 1fr;gap:22px}
    .card{height:330px;background:#fff;border:3px solid ${BRAND.purple};border-radius:19px;padding:25px 25px}
    .card h2{font-size:25px;color:${BRAND.purple};letter-spacing:1.5px;margin-bottom:22px}
    .card p{font-size:30px;font-weight:600;line-height:1.22;overflow-wrap:anywhere}
    .direct{background:#F9F4FF}
    .direct p{font-size:32px}
    .direct small{display:block;margin-top:15px;font-size:19px;line-height:1.2;color:${BRAND.muted}}
    .direct .email{display:block;margin-top:6px;font-size:17px;white-space:nowrap}
    .alternate{border-color:${BRAND.magenta};background:${BRAND.blush}}
    .alternate h2{color:#A10C82}.alternate p{font-size:26px;line-height:1.23}
    .alternate small{display:block;margin-top:9px;font-size:17px;line-height:1.2;color:${BRAND.muted}}
    .notes{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:18px}
    .note{background:${BRAND.lilac};border-left:6px solid ${BRAND.purple};border-radius:11px;padding:22px 24px;font-size:26px;font-weight:600;line-height:1.3}
  `, `<div class="eyebrow">SPEAK UP EARLY</div><div class="status">POLICY APPROVAL STILL REQUIRED</div><h1>Raising a concern</h1>
    <div class="start">You notice something that may break the standards, a policy, or the law</div>
    <div class="fork"><span></span><span></span><span></span></div><div class="routes"><div class="card direct"><h2>PRIMARY CONDUCT CONTACT</h2><p>Michelle Caldwell<span class="email">Michelle.caldwell@synozur.com</span></p></div>
    <div class="card alternate"><h2>OUT-OF-BAND ALTERNATE</h2><p>If Michelle is involved or you are uncomfortable contacting her: ReportIt@synozur.com<small>No guarantee of independence or absolute anonymity</small></p></div>
    <div class="card"><h2>SECURITY ISSUE</h2><p>Email<br>security@synozur.com</p></div></div>
    <div class="notes"><div class="note">Good faith is enough: you don't need proof, and you don't need to investigate first.</div>
    <div class="note">Nothing here limits lawful reporting to government or regulatory authorities.</div></div>`);
}

/** Import the lesson export only when the PDF is rendered. */
async function quickReferenceHtml(): Promise<string | null> {
  let content: Record<string, unknown>;
  try {
    content = await import("./content");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND" ||
        String(error).includes("Cannot find module")) return null;
    throw error;
  }
  if (!("DECISION_REFERENCE" in content)) return null;
  const source = content.DECISION_REFERENCE as {
    title: string; intro: string;
    checks: { label: string; detail: string }[];
    reporting: { need: string; route: string }[];
    reminder: string;
  };
  if (!source || !Array.isArray(source.checks) || !Array.isArray(source.reporting)) {
    throw new Error("DECISION_REFERENCE is missing checks or reporting");
  }
  const logo = await dataUri(LOGO_FILES.horizontal);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(source.title)} · Business Conduct (Draft)</title><style>${baseCss()}
    @page{size:Letter;margin:0}body{width:816px;height:1056px;position:relative;overflow:hidden;background:#fff}
    .wm{position:absolute;left:50%;top:52%;transform:translate(-50%,-50%) rotate(-32deg);font-size:125px;font-weight:700;letter-spacing:12px;color:rgba(129,15,251,.07);z-index:0}
    header{height:135px;background:linear-gradient(110deg,${BRAND.purple},${BRAND.magenta});padding:27px 43px;display:flex;align-items:center;justify-content:space-between;color:#fff;gap:15px}
    .logo{background:#fff;border-radius:10px;padding:11px 15px;flex:none}.logo img{height:39px;display:block}
    header h1{font-size:30px;line-height:1.12}header p{font-size:14px}
    .draft{background:${BRAND.ink};color:#fff;font-size:12px;font-weight:600;letter-spacing:1.5px;padding:9px 43px}
    main{position:relative;z-index:1;padding:23px 44px;font-size:12.5px;line-height:1.32}
    main h2{font-size:18px;color:${BRAND.purple};margin:15px 0 8px}
    .intro{font-size:14px;line-height:1.35;margin:0 0 12px}
    ol{list-style:none;counter-reset:item}
    ol li{counter-increment:item;position:relative;padding:0 0 10px 32px;min-height:27px}
    ol li:before{content:counter(item);position:absolute;left:0;top:0;background:${BRAND.purple};color:#fff;width:23px;height:23px;display:grid;place-items:center;border-radius:50%;font-weight:700}
    table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:11.4px}
    th,td{padding:8px 10px;border-bottom:1px solid ${BRAND.line};text-align:left;vertical-align:top;overflow-wrap:anywhere}
    th{background:${BRAND.lilac};font-weight:700}th:first-child{width:37%}
    .reminder{background:${BRAND.blush};padding:11px 13px;border-left:4px solid ${BRAND.magenta};margin-top:14px}
    footer{position:absolute;left:44px;right:44px;bottom:22px;border-top:1px solid ${BRAND.line};padding-top:8px;color:${BRAND.muted};font-size:11px}
  </style></head><body><div class="wm" aria-hidden="true">DRAFT</div>
    <header><div class="logo"><img src="${logo}" alt="Synozur Alliance"></div><div><h1>${escapeHtml(source.title)}</h1><p>Business conduct · annual training reference</p></div></header>
      <div class="draft">DRAFT · POLICY APPROVAL PENDING · ATTESTATION-QUESTION CONTACT UNCONFIRMED</div><main>
      <p class="intro">${escapeHtml(source.intro)}</p><h2>The five-question decision test</h2>
      <ol>${source.checks.map(x => `<li><b>${escapeHtml(x.label)}:</b> ${escapeHtml(x.detail)}</li>`).join("")}</ol>
      <h2>Where to raise a concern or ask</h2>
      <table><thead><tr><th>Need</th><th>Route</th></tr></thead><tbody>${source.reporting.map(x => `<tr><td>${escapeHtml(x.need)}</td><td>${escapeHtml(x.route)}</td></tr>`).join("")}</tbody></table>
      <p class="reminder">${escapeHtml(source.reminder)}</p></main>
    <footer>Synozur Standards of Business Conduct · Course resource</footer></body></html>`;
}

export const GRAPHICS = {
  hero: { file: "hero.jpg", width: 1600, height: 900, build: hero },
  poster: { file: "welcome-poster.jpg", width: 1600, height: 900, build: poster },
  recuse: { file: "disclose-and-recuse.png", width: 1600, height: 900, build: recuse },
  correction: { file: "record-correction-example.png", width: 1600, height: 1000, build: correction },
  routes: { file: "reporting-routes.png", width: 1600, height: 900, build: routes },
} as const;

export const QUICK_REFERENCE_FILE = "decision-and-reporting-reference-business-conduct.pdf";

export async function renderAll(): Promise<void> {
  for (const graphic of Object.values(GRAPHICS)) {
    await renderPng({ html: await graphic.build(), out: path.join(MEDIA_DIR, graphic.file), width: graphic.width, height: graphic.height, scale: 1 });
  }
  const html = await quickReferenceHtml();
  if (html === null) {
    console.log("Skipping decision-and-reporting-reference-business-conduct.pdf: content.ts does not yet export DECISION_REFERENCE.");
    return;
  }
  await renderPdf({ html, out: path.join(MEDIA_DIR, QUICK_REFERENCE_FILE) });
}