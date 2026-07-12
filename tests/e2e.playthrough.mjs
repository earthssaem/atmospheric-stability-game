// 「모구모구 하늘마을」 브라우저 완주 테스트 — 타이틀 → S1~S6 → 대잔치 엔딩까지 실제 터치로 자동 플레이
//
// 준비:  npm i playwright  (크로미움이 없으면 npx playwright install chromium)
// 실행:  node tests/e2e.playthrough.mjs                    # 16:9 (1180×720)
//        node tests/e2e.playthrough.mjs --size=1024x768    # 4:3 (구형 iPad)
//        CHROMIUM_PATH=/path/to/chrome node tests/e2e.playthrough.mjs  # 크로미움 직접 지정
//
// 좌표는 SVG 좌표계로 지정하고 getScreenCTM으로 화면 좌표로 변환하므로 어떤 해상도에서도 동작한다.
import { chromium } from 'playwright';

const sizeArg = process.argv.find(a => a.startsWith('--size='));
const [W, H] = (sizeArg ? sizeArg.split('=')[1] : '1180x720').split('x').map(Number);
const FILE_URL = new URL('../sky-village.html', import.meta.url).href;

const errors = [];
const launchOpt = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const browser = await chromium.launch(launchOpt);
const page = await browser.newPage({ viewport: { width: W, height: H }, hasTouch: true });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_CONNECTION')) errors.push('CONSOLE: ' + m.text()); });

let failures = 0;
function check(name, ok) {
  console.log(`${ok ? '✅' : '❌'} ${name}`);
  if (!ok) failures++;
}

// 대화창이 떠 있으면 계속 탭하며 ms 동안 대기. sel이 보이면 즉시 true.
async function pump(ms = 4000, sel = null) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (sel && await page.isVisible(sel).catch(() => false)) return true;
    const on = await page.evaluate(() => document.getElementById('dialogWrap').classList.contains('on'));
    if (on) { await page.tap('#dialogBox').catch(() => {}); await page.waitForTimeout(130); }
    else await page.waitForTimeout(170);
  }
  return sel ? await page.isVisible(sel).catch(() => false) : true;
}
async function setSlider(id, v) {
  await page.evaluate(([id, v]) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, [id, v]);
}
async function tapHouse(i) {
  await page.evaluate(i => document.getElementById('house' + i).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })), i);
  await page.waitForTimeout(500);
  await pump(6000);
  await page.waitForTimeout(300);
}
// SVG 좌표 → 화면 좌표 (해상도 무관)
async function svg2scr(x, y) {
  return page.evaluate(([x, y]) => {
    const svg = document.querySelector('#scene svg.full');
    const p = svg.createSVGPoint(); p.x = x; p.y = y;
    const q = p.matrixTransform(svg.getScreenCTM());
    return { x: q.x, y: q.y };
  }, [x, y]);
}
async function elCenter(id) {
  return page.evaluate(id => { const r = document.getElementById(id).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, id);
}
// 요소를 잡아 SVG 좌표 (tx,ty)까지 드래그, holdMs 동안 유지
async function dragToSvg(id, tx, ty, holdMs = 0, steps = 16) {
  const p = await elCenter(id);
  const t = await svg2scr(tx, ty);
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(p.x + (t.x - p.x) * i / steps, p.y + (t.y - p.y) * i / steps);
    await page.waitForTimeout(36);
  }
  await page.waitForTimeout(holdMs);
  await page.mouse.up();
}
async function toMap() {
  const ok = await pump(20000, '#toMapBtn');
  if (!ok) throw new Error('결과 패널이 나타나지 않음');
  await page.tap('#toMapBtn');
  await page.waitForTimeout(600);
}
const stampTxt = async () => page.evaluate(() => document.getElementById('stampBtn').textContent.trim());

// ═══════ 0. 교사용 ?start=3 파라미터 + 홈 버튼 + 의뢰 다시 듣기 ═══════
await page.goto(FILE_URL + '?start=3');
await page.waitForTimeout(600);
await page.tap('#startBtn'); await pump(5000); await page.waitForTimeout(300);
await tapHouse(2);   // ?start=3이면 S3(몽실이네)이 바로 열려 있어야 함
check('?start=3: S3 바로 진입', await page.evaluate(() => !!document.getElementById('s3svg')));
check('스테이지 중 홈 버튼 표시', await page.isVisible('#homeBtn'));
// 의뢰 다시 듣기: 상단 이름표 탭 → 대화창
await page.tap('#stageHead'); await page.waitForTimeout(400);
check('이름표 탭 → 의뢰 다시 듣기', await page.evaluate(() => document.getElementById('dialogWrap').classList.contains('on')));
await pump(4000);
// 홈 버튼 → 확인 패널 → 마을로
await page.tap('#homeBtn'); await page.waitForTimeout(300);
check('홈 버튼 → 확인 패널', await page.isVisible('#homeGo'));
await page.tap('#homeGo'); await page.waitForTimeout(600);
check('마을로 복귀', await page.evaluate(() => !!document.getElementById('mapSvg')));

// ═══════ 본편: 처음부터 완주 ═══════
await page.goto(FILE_URL);
await page.waitForTimeout(600);
await page.tap('#startBtn'); await pump(5000); await page.waitForTimeout(300);

// ── S1 (지표 y=596-44=552svg, 200px/km, x=620) ──
await tapHouse(0);
const s1y = alt => 552 - alt * 200;
await dragToSvg('s1pcl', 620, s1y(1.05), 1800);   // ≤20℃
await pump(5000); await page.waitForTimeout(300);
await dragToSvg('s1pcl', 620, s1y(1.55), 1800);   // ≤15℃
await pump(5000); await page.waitForTimeout(300);
await dragToSvg('s1pcl', 620, s1y(0.5), 1800);    // 25℃ (2km에서 하강)
await pump(5000);
check('S1 스탬프 3개', (await stampTxt()).startsWith('3/'));
await toMap();

// ── S2 (x=1080, 지표 y=594, 167.5px/km) ──
await tapHouse(1);
const s2y = alt => 594 - alt * 167.5;
await dragToSvg('s2pcl', 1080, s2y(3.15), 400);       // ON 상태로 3km 돌파
await page.waitForTimeout(500);
await dragToSvg('s2pcl', 1080, s2y(0), 200);
await page.tap('#s2sw'); await page.waitForTimeout(250);
await dragToSvg('s2pcl', 1080, s2y(3.15), 400);       // OFF 상태로 3km 돌파
await pump(8000, '.quizOpt');
const quizIdx = await page.evaluate(() =>
  [...document.querySelectorAll('.quizOpt')].findIndex(b => b.textContent.includes('숨은열')));
check('S2 퀴즈 표시', quizIdx >= 0);
await page.tap(`#s2q${quizIdx}`);
await pump(6000);
check('S2 스탬프 5개', (await stampTxt()).startsWith('5/'));
await toMap();

// ── S3 ──
await tapHouse(2);
for (const [T, Td] of [[22, 14], [26, 10], [24, 12]]) {
  await setSlider('s3T', T); await setSlider('s3Td', Td);
  await page.waitForTimeout(150);
  await page.tap('#s3go');
  await page.waitForTimeout(3200);
  await pump(5000); await page.waitForTimeout(300);
}
check('S3 스탬프 8개', (await stampTxt()).startsWith('8/'));
await toMap();

// ── S4 (배달: svg x 1170까지 드래그) ──
await tapHouse(3);
async function deliver() {
  const p = await elCenter('s4pcl');
  const t = await svg2scr(1170, 300);
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  for (let i = 1; i <= 26; i++) { await page.mouse.move(p.x + (t.x - p.x) * i / 26, t.y); await page.waitForTimeout(70); }
  await page.waitForTimeout(1500);
  await page.mouse.up();
  await page.waitForTimeout(1200);
  await pump(6000); await page.waitForTimeout(400);
}
await setSlider('s4T', 20); await setSlider('s4Td', 14); await setSlider('s4M', 2);   // 26.25℃
await page.waitForTimeout(150); await deliver();
await setSlider('s4T', 20); await setSlider('s4Td', 10); await setSlider('s4M', 1);   // H=1.25 ≥ 1
await page.waitForTimeout(150); await deliver();
await setSlider('s4T', 30); await setSlider('s4Td', 29); await setSlider('s4M', 3);   // +14.375℃
await page.waitForTimeout(150); await deliver();
check('S4 스탬프 11개', (await stampTxt()).startsWith('11/'));
await toMap();

// ── S5 (감정: 찔러본 뒤 판정 → 층운 설계 → 조건부 적운) ──
await tapHouse(4);
for (let n = 0; n < 3; n++) {
  const txt = await page.evaluate(() => document.getElementById('s5Order').textContent);
  const g = parseFloat(txt.match(/γ = ([\d.]+)/)[1]);
  const v = g < 5 ? 'stable' : g > 10 ? 'unstable' : 'conditional';
  if (n === 0) {   // 관찰 없이 판정 시도 → 막혀야 함
    await page.tap(`.vCard[data-v="${v}"]`); await page.waitForTimeout(400);
    const blocked = await page.evaluate(() => document.getElementById('toast').textContent.includes('찔러'));
    check('S5 관찰 없이 판정 차단', blocked);
  }
  // 관찰 (쿡 찔러보기): 이전 시뮬레이션이 끝나기 전엔 무시되므로 판정패가 켜질 때까지 재시도
  for (let k = 0; k < 12; k++) {
    await page.tap('#s5poke');
    await page.waitForTimeout(900);
    if (await page.evaluate(() => document.getElementById('s5cards').style.opacity === '1')) break;
  }
  await page.waitForTimeout(600);
  await page.tap(`.vCard[data-v="${v}"]`);
  await page.waitForTimeout(1400);
}
await pump(6000); await page.waitForTimeout(300);
await setSlider('s5g', 4); await page.waitForTimeout(150);
await page.tap('#s5push');
await page.waitForTimeout(6500); await pump(6000); await page.waitForTimeout(300);
await setSlider('s5g', 9); await page.waitForTimeout(150);
await page.tap('#s5push');
await page.waitForTimeout(5500); await pump(6000);
check('S5 스탬프 14개', (await stampTxt()).startsWith('14/'));
await toMap();

// ── S6 ──
await tapHouse(5);
async function makeCloud(g, T, Td) {
  await setSlider('s6g', g); await setSlider('s6T', T); await setSlider('s6Td', Td);
  await page.waitForTimeout(150);
  await page.tap('#s6go');
  await page.waitForTimeout(4000);
  await pump(6000); await page.waitForTimeout(400);
}
await makeCloud(4, 26, 16);     // 층운 카펫
await makeCloud(12, 26, 16);    // 적운 풍선
await makeCloud(9.5, 30, 14);   // 2km 적운
check('엔딩 도달', await pump(25000, '#endMap'));
check('스탬프 17/17', (await stampTxt()).startsWith('17/'));
const titles = await page.evaluate(() => [...document.querySelectorAll('.titleChip')].map(e => e.textContent));
check('칭호 5종', titles.length === 5);
console.log('칭호:', titles.join(', '));
check('JS 오류 없음', errors.length === 0);
if (errors.length) console.log(errors);

await browser.close();
console.log(failures === 0 ? `\n[${W}x${H}] 완주 테스트 통과! 🎉` : `\n[${W}x${H}] ${failures}개 실패`);
process.exit(failures === 0 ? 0 : 1);
