/**
 * Source for the Information Security course graphics and the downloadable
 * "What to do first" reference. Every label is plain text here so it can be
 * edited and re-rendered with:
 *   npx tsx scripts/build-annual-training-course.ts information-security --render-only
 * All people, addresses, and links in the mock message are fictional.
 */
import path from "node:path";
import { BRAND, LOGO_FILES, baseCss, dataUri, page, renderPdf, renderPng } from "../shared/render";
import { REPORTING } from "./content";

export const MEDIA_DIR = path.resolve(import.meta.dirname, "media");

const icon = {
  pause: `<svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="21" stroke="currentColor" stroke-width="3.5"/><rect x="16" y="14" width="5.5" height="20" rx="2" fill="currentColor"/><rect x="26.5" y="14" width="5.5" height="20" rx="2" fill="currentColor"/></svg>`,
  phone: `<svg viewBox="0 0 48 48" fill="none"><rect x="13" y="4" width="22" height="40" rx="5" stroke="currentColor" stroke-width="3.5"/><path d="M20 38h8" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><path d="M19 20l4 4 7-8" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  flag: `<svg viewBox="0 0 48 48" fill="none"><path d="M11 44V6" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><path d="M11 8h24l-5 8 5 8H11" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/></svg>`,
  check: `<svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="21" stroke="currentColor" stroke-width="3.5"/><path d="M15 25l6 6 12-13" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  camera: `<svg viewBox="0 0 64 64" fill="none"><rect x="4" y="16" width="40" height="32" rx="7" stroke="currentColor" stroke-width="4"/><path d="M44 28l16-9v26l-16-9z" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>`,
};

const rings = (size: number, color: string, opacity: number) => `
  <svg class="rings" width="${size}" height="${size}" viewBox="0 0 200 200" fill="none" style="opacity:${opacity}">
    ${[96, 76, 56, 36].map(r => `<circle cx="100" cy="100" r="${r}" stroke="${color}" stroke-width="3"/>`).join("")}
  </svg>`;

async function hero(): Promise<string> {
  const logo = await dataUri(LOGO_FILES.horizontal);
  const css = `
  body{background:linear-gradient(135deg,${BRAND.purple} 0%,#A612E4 48%,${BRAND.magenta} 100%);position:relative}
  .rings{position:absolute}
  .r1{right:-150px;bottom:-190px}.r2{left:-120px;top:520px}
  .logo{position:absolute;left:72px;top:64px;background:#fff;border-radius:18px;padding:22px 30px}
  .logo img{height:62px;display:block}
  .steps{position:absolute;left:78px;top:250px;display:flex;flex-direction:column;gap:30px}
  .step{display:flex;align-items:baseline;gap:26px;color:#fff}
  .num{font-weight:600;font-size:34px;opacity:.75;width:56px}
  .word{font-weight:700;font-size:84px;letter-spacing:-1px;line-height:1}
  .sub{font-weight:400;font-size:28px;opacity:.9;margin-left:6px}
  .kicker{position:absolute;left:80px;bottom:62px;color:#fff;font-weight:600;font-size:22px;letter-spacing:5px;opacity:.85}
  .phone{position:absolute;right:170px;top:120px;width:360px;height:660px;border-radius:52px;background:${BRAND.ink};padding:22px;box-shadow:0 30px 70px rgba(28,21,48,.35)}
  .screen{width:100%;height:100%;border-radius:36px;background:#F7F4FC;padding:60px 26px 40px;position:relative;display:flex;flex-direction:column;justify-content:center}
  .home{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);width:120px;height:6px;border-radius:3px;background:#CFC6DE}
  .notch{position:absolute;top:14px;left:50%;transform:translateX(-50%);width:110px;height:26px;border-radius:14px;background:${BRAND.ink}}
  .card{background:#fff;border-radius:22px;padding:26px 24px;box-shadow:0 8px 24px rgba(28,21,48,.12)}
  .card h3{font-size:25px;font-weight:700;margin-bottom:10px}
  .card p{font-size:19px;color:${BRAND.muted};line-height:1.4;margin-bottom:22px}
  .meta{font-size:16px;color:${BRAND.muted};margin-bottom:6px}
  .btns{display:flex;gap:12px}
  .btn{flex:1;text-align:center;border-radius:14px;padding:14px 0;font-weight:700;font-size:21px}
  .deny{background:${BRAND.purple};color:#fff;box-shadow:0 0 0 5px rgba(129,15,251,.25)}
  .approve{background:#ECE6F5;color:${BRAND.muted}}
  .hint{margin-top:26px;background:${BRAND.blush};border-radius:16px;padding:16px 18px;font-size:18px;line-height:1.35;color:${BRAND.ink}}
  .hint b{color:${BRAND.magenta}}
  `;
  const body = `
  ${rings(620, "#fff", 0.16).replace('class="rings"', 'class="rings r1"')}
  ${rings(420, "#fff", 0.1).replace('class="rings"', 'class="rings r2"')}
  <div class="logo"><img src="${logo}" alt=""></div>
  <div class="steps">
    <div class="step"><span class="num">01</span><span class="word">Recognize</span></div>
    <div class="step"><span class="num">02</span><span class="word">Protect</span></div>
    <div class="step"><span class="num">03</span><span class="word">Report</span></div>
  </div>
  <div class="kicker">ANNUAL INFORMATION SECURITY TRAINING</div>
  <div class="phone"><div class="screen"><div class="notch"></div>
    <div class="card">
      <div class="meta">Sign-in request · just now</div>
      <h3>Are you trying to sign in?</h3>
      <p>Only approve a request you started yourself.</p>
      <div class="btns"><div class="btn deny">Deny</div><div class="btn approve">Approve</div></div>
    </div>
    <div class="hint"><b>Didn’t start it?</b> Deny it and report it.</div>
    <div class="home"></div>
  </div></div>`;
  return page(1600, 900, css, body);
}

async function poster(): Promise<string> {
  const logo = await dataUri(LOGO_FILES.horizontal);
  const css = `
  body{background:#fff;position:relative}
  .panel{position:absolute;right:0;top:0;width:640px;height:900px;background:linear-gradient(150deg,${BRAND.purple},${BRAND.magenta});clip-path:polygon(22% 0,100% 0,100% 100%,0 100%)}
  .rings{position:absolute;right:-40px;top:190px}
  .cam{position:absolute;right:200px;top:360px;width:190px;color:#fff}
  .logo{position:absolute;left:96px;top:84px;height:74px}
  .kicker{position:absolute;left:100px;top:268px;color:${BRAND.purple};font-weight:600;font-size:24px;letter-spacing:3px}
  h1{position:absolute;left:96px;top:318px;width:860px;font-weight:700;font-size:78px;line-height:1.05;letter-spacing:-1px}
  .role{position:absolute;left:100px;top:510px;font-size:30px;color:${BRAND.muted};font-weight:400}
  .badge{position:absolute;left:96px;top:600px;background:${BRAND.magenta};color:#fff;border-radius:999px;padding:22px 44px;font-weight:700;font-size:42px}
  .note{position:absolute;left:100px;bottom:74px;font-size:24px;color:${BRAND.muted}}
  `;
  const body = `
  <div class="panel"></div>
  ${rings(520, "#fff", 0.2)}
  <div class="cam">${icon.camera}</div>
  <img class="logo" src="${logo}" alt="">
  <div class="kicker">SYNOZUR INFORMATION SECURITY: ANNUAL TRAINING</div>
  <h1>Welcome from Chris&nbsp;McNulty</h1>
  <div class="role">Chris McNulty, CTO, Synozur</div>
  <div class="badge">Introduction video coming soon</div>
  <div class="note">Until the video is added, read the draft transcript in this lesson.</div>`;
  return page(1600, 900, css, body);
}

function fakeCode(): string {
  // A stylized, deliberately non-decodable block pattern (no format or data
  // encoding) that only suggests a QR code.
  const cells: string[] = [];
  const n = 21;
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const finder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      let on: boolean;
      if (finder(r, c)) {
        const rr = r < 7 ? r : r - (n - 7);
        const cc = c < 7 ? c : c - (n - 7);
        const edge = rr === 0 || rr === 6 || cc === 0 || cc === 6;
        const core = rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4;
        on = edge || core;
      } else {
        on = rand() > 0.55;
      }
      if (on) cells.push(`<rect x="${c}" y="${r}" width="1" height="1"/>`);
    }
  }
  return `<svg viewBox="-1 -1 23 23" width="150" height="150" fill="${BRAND.ink}"><rect x="-1" y="-1" width="23" height="23" fill="#fff"/>${cells.join("")}</svg>`;
}

async function suspiciousMessage(): Promise<string> {
  const css = `
  body{background:${BRAND.lilac};position:relative}
  .tag{position:absolute;left:60px;top:34px;background:${BRAND.ink};color:#fff;border-radius:999px;padding:8px 20px;font-weight:600;font-size:18px;letter-spacing:2px}
  .mail{position:absolute;left:60px;top:92px;width:930px;height:870px;background:#fff;border-radius:20px;box-shadow:0 18px 50px rgba(28,21,48,.14);overflow:hidden}
  .bar{height:52px;background:#F1ECF8;display:flex;align-items:center;gap:10px;padding:0 22px;font-size:18px;color:${BRAND.muted}}
  .dot{width:13px;height:13px;border-radius:50%;background:#D6CCE6}
  .hdr{padding:26px 40px 20px;border-bottom:1px solid ${BRAND.line}}
  .row{font-size:21px;color:${BRAND.muted};margin-bottom:10px}
  .row b{color:${BRAND.ink};font-weight:600}
  .subject{font-size:28px;font-weight:700;color:${BRAND.ink};margin-top:8px;line-height:1.25}
  .bodytext{padding:26px 40px;font-size:22px;line-height:1.55;color:#2A2340}
  .bodytext p{margin-bottom:18px}
  .cta{display:flex;align-items:flex-start;gap:34px;margin-top:8px}
  .btn{display:inline-block;background:#2F6FEB;color:#fff;border-radius:10px;padding:14px 26px;font-weight:700;font-size:22px}
  .tip{margin-top:12px;background:#2A2340;color:#fff;font-size:16px;border-radius:8px;padding:8px 12px;display:inline-block}
  .qr{display:flex;flex-direction:column;align-items:center;gap:6px;font-size:16px;color:${BRAND.muted}}
  .sig{margin-top:20px;color:${BRAND.muted};font-size:20px}
  .mk{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:50%;background:${BRAND.magenta};color:#fff;font-weight:700;font-size:21px;margin-left:10px;vertical-align:middle;box-shadow:0 0 0 4px rgba(230,12,179,.2)}
  .hl{background:rgba(230,12,179,.12);border-radius:6px;padding:1px 6px}
  .side{position:absolute;left:1040px;top:92px;width:500px}
  .side h2{font-size:34px;font-weight:700;margin-bottom:24px}
  .item{display:flex;gap:18px;margin-bottom:26px}
  .item .mk{margin:0;flex:none}
  .item h3{font-size:24px;font-weight:700;margin-bottom:4px}
  .item p{font-size:19px;line-height:1.4;color:${BRAND.muted}}
  .foot{position:absolute;left:1040px;bottom:40px;width:500px;font-size:17px;color:${BRAND.muted};line-height:1.4}
  `;
  const body = `
  <div class="tag">FICTIONAL TRAINING EXAMPLE</div>
  <div class="mail">
    <div class="bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span style="margin-left:12px">Inbox</span></div>
    <div class="hdr">
      <div class="row">From: <b>Synozur IT Service Desk</b> <span class="hl">&lt;servicedesk@synozur-it-support.com&gt;</span><span class="mk">1</span></div>
      <div class="row">To: Alex Rivera</div>
      <div class="subject">ACTION REQUIRED: Your account will be locked in <span class="hl">15 minutes</span><span class="mk">2</span></div>
    </div>
    <div class="bodytext">
      <p>Hi Alex,</p>
      <p>We detected unusual sign-in activity on your account. To keep access before your 9:00 client meeting, <span class="hl">approve the sign-in request we just sent to your phone, then install our remote support tool.</span><span class="mk">3</span></p>
      <p><span class="hl">This is a confidential security matter. Please don’t discuss it with your manager or team until we’re finished.</span><span class="mk">4</span></p>
      <div class="cta">
        <div><span class="btn">Install support tool</span><div class="tip">Link goes to: synozur-it-support.com/remote-setup</div></div>
        <div class="qr">${fakeCode()}<span>Or scan to verify on your phone</span></div>
        <span class="mk" style="margin-top:6px">5</span>
      </div>
      <div class="sig">IT Service Desk</div>
    </div>
  </div>
  <div class="side">
    <h2>Warning signs</h2>
    <div class="item"><span class="mk">1</span><div><h3>Lookalike sender</h3><p>synozur-it-support.com isn’t a Synozur address.</p></div></div>
    <div class="item"><span class="mk">2</span><div><h3>Manufactured urgency</h3><p>A 15-minute deadline pushes you to act before you think.</p></div></div>
    <div class="item"><span class="mk">3</span><div><h3>Unusual request</h3><p>Approving a sign-in you didn’t start or installing software from a message isn’t a normal process.</p></div></div>
    <div class="item"><span class="mk">4</span><div><h3>Secrecy</h3><p>Being told to keep your manager out of it is a red flag.</p></div></div>
    <div class="item"><span class="mk">5</span><div><h3>Disguised destination</h3><p>The button and the code lead somewhere other than Synozur.</p></div></div>
  </div>
  <div class="foot">Names, addresses, and links in this example are made up. The code pattern is decorative and can’t be scanned.</div>`;
  return page(1600, 1000, css, body);
}

async function decisionDiagram(): Promise<string> {
  const css = `
  body{background:#fff;position:relative}
  .kicker{position:absolute;left:70px;top:52px;color:${BRAND.purple};font-weight:600;font-size:22px;letter-spacing:4px}
  .title{position:absolute;left:70px;top:88px;font-size:44px;font-weight:700}
  .card{position:absolute;top:210px;width:400px;height:440px;border-radius:24px;padding:34px 32px;background:${BRAND.lilac};border:3px solid ${BRAND.line}}
  .card .ic{width:62px;height:62px;color:${BRAND.purple};margin-bottom:18px}
  .n{position:absolute;right:28px;top:22px;font-size:64px;font-weight:700;color:rgba(129,15,251,.16)}
  .card h3{font-size:36px;font-weight:700;margin-bottom:14px;line-height:1.1}
  .card p{font-size:23px;line-height:1.45;color:#3A3350}
  .c1{left:70px}.c2{left:560px}
  .arrow{position:absolute;top:410px;width:60px;height:40px}
  .a1{left:485px}
  .branch{position:absolute;left:1050px;width:480px;border-radius:24px;padding:26px 30px}
  .ok{top:210px;height:190px;border:3px solid ${BRAND.line};background:#fff}
  .rep{top:430px;height:300px;background:linear-gradient(140deg,${BRAND.purple},${BRAND.magenta});color:#fff}
  .branch .lbl{font-size:18px;font-weight:600;letter-spacing:2px;margin-bottom:8px}
  .ok .lbl{color:${BRAND.muted}}
  .branch h3{font-size:32px;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:14px}
  .branch h3 .ic{width:40px;height:40px;flex:none}
  .ok h3 .ic{color:${BRAND.purple}}
  .branch p{font-size:22px;line-height:1.45}
  .ok p{color:#3A3350}
  .fork{position:absolute;left:960px;top:300px}
  .note{position:absolute;left:70px;top:700px;width:880px;border-radius:18px;background:${BRAND.blush};padding:22px 28px;font-size:23px;line-height:1.45}
  .note b{color:${BRAND.magenta}}
  .foot{position:absolute;left:70px;bottom:40px;font-size:19px;color:${BRAND.muted}}
  `;
  const arrow = `<svg viewBox="0 0 60 40"><path d="M4 20h44" stroke="${BRAND.purple}" stroke-width="5" stroke-linecap="round"/><path d="M40 8l14 12-14 12" fill="none" stroke="${BRAND.purple}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const fork = `<svg width="90" height="340" viewBox="0 0 90 340" fill="none"><path d="M4 110 C 50 110, 40 5, 84 5" stroke="${BRAND.purple}" stroke-width="5" stroke-linecap="round"/><path d="M4 110 C 50 110, 40 280, 84 280" stroke="${BRAND.magenta}" stroke-width="5" stroke-linecap="round"/><path d="M70 -6l14 11-14 11M70 269l14 11-14 11" stroke="${BRAND.ink}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const body = `
  <div class="kicker">WHEN A REQUEST PUTS PRESSURE ON YOU</div>
  <div class="title">Pause, verify independently, report</div>
  <div class="card c1"><span class="n">1</span><div class="ic">${icon.pause}</div><h3>Pause</h3><p>Does it involve urgency, secrecy, sign-in codes, payments, software, or moving data? Slow down before you act.</p></div>
  <div class="arrow a1">${arrow}</div>
  <div class="card c2"><span class="n">2</span><div class="ic">${icon.phone}</div><h3>Verify independently</h3><p>Use a contact you already know: the company directory, a saved number, or the published IT support address. Never the details in the request.</p></div>
  <div class="fork">${fork}</div>
  <div class="branch ok"><div class="lbl">CONFIRMED AND EXPECTED</div><h3><span class="ic">${icon.check}</span>Continue</h3><p>Proceed through the normal, approved process.</p></div>
  <div class="branch rep"><div class="lbl">CAN’T CONFIRM, OR ALREADY ACTED</div><h3><span class="ic">${icon.flag}</span>3 · Report</h3><p>Don’t act on the request. Report what happened and when, and keep the message. You don’t need proof.</p></div>
  <div class="note"><b>Already clicked, replied, or approved?</b> Go straight to Report. Early reports limit harm.</div>
  <div class="foot">Use this for any request involving access, codes, payments, software, or data, by email, chat, phone, QR code, or video.</div>`;
  return page(1600, 900, css, body);
}

async function boundary(): Promise<string> {
  const css = `
  body{background:#fff;position:relative}
  .kicker{position:absolute;left:70px;top:48px;color:${BRAND.purple};font-weight:600;font-size:22px;letter-spacing:4px}
  .title{position:absolute;left:70px;top:84px;font-size:44px;font-weight:700}
  .col{position:absolute;top:180px;width:660px;height:520px;border-radius:26px;padding:30px 36px}
  .you{left:70px;background:${BRAND.lilac}}
  .resp{left:870px;background:${BRAND.blush}}
  .col h3{font-size:32px;font-weight:700;margin-bottom:6px}
  .col .sub{font-size:20px;color:${BRAND.muted};margin-bottom:22px}
  .row{display:flex;gap:20px;align-items:flex-start;margin-bottom:20px}
  .pill{flex:none;width:176px;border-radius:14px;padding:10px 0;text-align:center;font-weight:700;font-size:23px;color:#fff}
  .you .pill{background:${BRAND.purple}}
  .resp .pill{background:${BRAND.magenta}}
  .row p{font-size:22px;line-height:1.38;color:#2E2744;padding-top:6px}
  .divider{position:absolute;left:764px;top:170px;width:72px;height:540px;display:flex;flex-direction:column;align-items:center}
  .dash{flex:1;border-left:4px dashed #BBA9DA}
  .hand{background:${BRAND.ink};color:#fff;border-radius:14px;padding:12px 10px;font-size:17px;font-weight:700;text-align:center;line-height:1.25;width:120px;margin:10px 0}
  .strip{position:absolute;left:70px;right:70px;bottom:52px;border-radius:18px;background:${BRAND.ink};color:#fff;padding:22px 30px;font-size:23px;line-height:1.4}
  .strip b{color:#F7B3E6}
  `;
  const body = `
  <div class="kicker">WHEN SOMETHING HAS HAPPENED</div>
  <div class="title">Your part and the responders’ part</div>
  <div class="col you"><h3>You: every employee</h3><div class="sub">Act quickly, stick to the facts</div>
    <div class="row"><span class="pill">Stop</span><p>Stop interacting with the suspicious content or activity.</p></div>
    <div class="row"><span class="pill">Report</span><p>Share what happened, when, and what may be affected.</p></div>
    <div class="row"><span class="pill">Preserve</span><p>Keep messages, timestamps, and details. Don’t delete anything.</p></div>
    <div class="row"><span class="pill">Follow</span><p>Follow responders’ instructions and share details only with them.</p></div>
  </div>
  <div class="divider"><div class="dash"></div><div class="hand">Your report hands off here</div><div class="dash"></div></div>
  <div class="col resp"><h3>Authorized responders</h3><div class="sub">Contain, investigate, decide</div>
    <div class="row"><span class="pill">Contain</span><p>End sessions, reset credentials, or isolate devices.</p></div>
    <div class="row"><span class="pill">Investigate</span><p>Work out what happened and how far it reached.</p></div>
    <div class="row"><span class="pill">Notify?</span><p>Decide with legal advisers whether anyone must be notified.</p></div>
    <div class="row"><span class="pill">Coordinate</span><p>Handle any contact with clients or other outside parties.</p></div>
  </div>
  <div class="strip"><b>Leave to responders:</b> wiping devices · revisiting suspicious sites · confronting anyone · contacting clients or authorities about an incident</div>`;
  return page(1600, 900, css, body);
}

async function quickReferenceHtml(): Promise<string> {
  const logo = await dataUri(LOGO_FILES.horizontal);
  const contactRows = REPORTING.rows
    .map(r => `<tr><td>${r.need}</td><td class="${r.pending ? "pending" : ""}">${r.contact}</td></tr>`)
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>What to do first: information security quick reference (draft)</title><style>
  ${baseCss()}
  @page{size:Letter;margin:0}
  body{width:816px;height:1056px;position:relative;overflow:hidden}
  .wm{position:absolute;left:50%;top:52%;transform:translate(-50%,-50%) rotate(-32deg);font-size:120px;font-weight:700;color:rgba(129,15,251,.07);letter-spacing:10px;white-space:nowrap;z-index:0}
  .top{height:132px;background:linear-gradient(120deg,${BRAND.purple},${BRAND.magenta});padding:30px 44px;display:flex;align-items:center;justify-content:space-between}
  .logo{background:#fff;border-radius:12px;padding:12px 16px}.logo img{height:40px;display:block}
  .ttl{color:#fff;text-align:right}.ttl h1{font-size:34px;font-weight:700;line-height:1}.ttl p{font-size:15px;opacity:.92;margin-top:6px}
  .draft{background:${BRAND.ink};color:#fff;font-size:12.5px;font-weight:600;letter-spacing:1px;padding:7px 44px}
  main{padding:22px 44px 0;position:relative;z-index:1}
  .cols{display:flex;gap:18px}
  .box{flex:1;border-radius:14px;padding:16px 18px;background:${BRAND.lilac}}
  .box.b{background:${BRAND.blush}}
  h2{font-size:17px;font-weight:700;margin-bottom:10px}
  ol{padding-left:0;list-style:none;counter-reset:s}
  ol li{counter-increment:s;position:relative;padding-left:32px;margin-bottom:9px;font-size:13.5px;line-height:1.4}
  ol li::before{content:counter(s);position:absolute;left:0;top:0;width:22px;height:22px;border-radius:50%;background:${BRAND.purple};color:#fff;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center}
  .box.b ol li::before{background:${BRAND.magenta}}
  section{margin-top:18px}
  ul{padding-left:18px}ul li{font-size:13.5px;line-height:1.45;margin-bottom:3px}
  .two{columns:2;column-gap:28px}
  table{width:100%;border-collapse:collapse;font-size:13.5px}
  th,td{text-align:left;padding:9px 10px;border-bottom:1px solid ${BRAND.line};vertical-align:top}
  th{background:#F4F0FA;font-weight:700}
  td.pending{color:#9A1B6F;font-weight:600}
  .caveat{font-size:12.5px;color:${BRAND.muted};margin-top:8px}
  .dont{border-left:5px solid ${BRAND.magenta};background:#fff;padding:10px 14px;font-size:13.5px;line-height:1.45;border-radius:0 10px 10px 0;box-shadow:0 1px 0 ${BRAND.line}}
  footer{position:absolute;left:44px;right:44px;bottom:26px;font-size:11px;color:${BRAND.muted};display:flex;justify-content:space-between;border-top:1px solid ${BRAND.line};padding-top:10px}
  </style></head><body>
  <div class="wm" aria-hidden="true">DRAFT</div>
  <div class="top"><div class="logo"><img src="${logo}" alt="Synozur Alliance"></div><div class="ttl"><h1>What to do first</h1><p>Information security quick reference</p></div></div>
  <div class="draft">DRAFT v0.1 · NOT FOR RELEASE</div>
  <main>
    <div class="cols">
      <div class="box"><h2>If something seems suspicious</h2><ol>
        <li><b>Pause.</b> Don’t click, pay, approve, install, or share anything yet.</li>
        <li><b>Verify independently</b> with a contact you already know, never the details in the request.</li>
        <li><b>Report</b> anything you can’t verify.</li></ol></div>
      <div class="box b"><h2>If something has already happened</h2><ol>
        <li><b>Stop</b> the risky activity.</li>
        <li><b>Report immediately:</b> what happened, when, and what may be affected. You don’t need proof.</li>
        <li><b>Preserve</b> messages and timestamps. Don’t delete, wipe, or investigate.</li>
        <li><b>Follow</b> responders’ instructions.</li></ol></div>
    </div>
    <section><h2>Report these right away</h2><ul class="two">
      <li>A lost or stolen device, even if encrypted</li><li>An MFA prompt you didn’t start</li>
      <li>Files shared with the wrong people</li><li>Ransomware messages or malware alerts</li>
      <li>Unusual access or account activity</li><li>Credentials entered on a suspicious site</li></ul></section>
    <section><h2>Who to contact</h2><table><thead><tr><th style="width:44%">For</th><th>Contact</th></tr></thead><tbody>${contactRows}</tbody></table>
      <p class="caveat">${REPORTING.caveat} If your email or chat account may be compromised, use an independently verified alternative.</p></section>
    <section><div class="dont"><b>Leave to authorized responders:</b> wiping devices, revisiting suspicious sites, confronting anyone, and contacting clients or authorities about an incident.</div></section>
  </main>
  <footer><span>Synozur Information Security: Annual Training · Course reference</span><span>Synozur policies and client contracts take precedence.</span></footer>
  </body></html>`;
}

export const GRAPHICS = {
  hero: { file: "hero.jpg", width: 1600, height: 900, build: hero },
  poster: { file: "welcome-poster.jpg", width: 1600, height: 900, build: poster },
  message: { file: "suspicious-message.png", width: 1600, height: 1000, build: suspiciousMessage },
  decision: { file: "pause-verify-report.png", width: 1600, height: 900, build: decisionDiagram },
  boundary: { file: "incident-boundary.png", width: 1600, height: 900, build: boundary },
} as const;

export const QUICK_REFERENCE_FILE = "what-to-do-first-information-security.pdf";

export async function renderAll(): Promise<void> {
  for (const g of Object.values(GRAPHICS)) {
    await renderPng({ html: await g.build(), out: path.join(MEDIA_DIR, g.file), width: g.width, height: g.height, scale: 1.25 });
  }
  await renderPdf({ html: await quickReferenceHtml(), out: path.join(MEDIA_DIR, QUICK_REFERENCE_FILE) });
}
