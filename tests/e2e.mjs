// 본편 전체 진행 테스트 (headless Chromium) — 1부·2부를 실제로 끝까지 진행하며
// 이야기 흐름(짧은 조작 → 변화 → 반응 → 설명), 결정적인 순간의 예상과 막지 않는 피드백,
// 뭉게 크기·물방울·관찰값이 같은 상태에서 나오는지, 저장·이어 하기, 설정, 관찰 기록 창을 확인
// 실행: npm run test:e2e   (사전: npm install — playwright 설치)
// 화면 크기: VIEWPORT=1024x768 · 폰 세로 VIEWPORT=390x844 / 스크린샷: SHOTS=폴더 / 시스템 크로미움: CHROMIUM_PATH=...
import { chromium } from 'playwright';

const errors = [];
const launchOpts = { args: ['--autoplay-policy=no-user-gesture-required'], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) };
const browser = await chromium.launch(launchOpts);
const [VW, VH] = (process.env.VIEWPORT || '1280x800').split('x').map(Number);
const context = await browser.newContext({ viewport: { width: VW, height: VH } });
const page = await context.newPage();
const shot = async name => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${VW}x${VH}-${name}.png` }); };
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => {
  if (m.type() === 'error' && !m.text().includes('Failed to load resource') && !m.text().includes('net::ERR')) errors.push('console: ' + m.text());
});
const URL0 = new URL('../index.html', import.meta.url).href;
await page.goto(URL0);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(700);

let failed = 0;
const step = async (name, fn) => {
  try { await fn(); console.log('✅', name); }
  catch (e) {
    console.log('❌', name, '—', e.message.split('\n')[0]); failed++;
    const st = await page.evaluate(() => ({ ch: S.chapter, dlg: S.dialogActive && document.getElementById('dText').textContent, ov: document.getElementById('overlay').textContent.slice(0, 120), act: document.getElementById('actBar').textContent.replace(/\s+/g, ' ').slice(0, 120), h: Sim.h })).catch(() => null);
    console.log('   상태:', JSON.stringify(st));
  }
};
const ev = (fn, arg) => page.evaluate(fn, arg);
const wait = ms => page.waitForTimeout(ms);
const click = async sel => {
  await page.waitForSelector(sel, { timeout: 8000 });
  await ev(s => { const el = document.querySelector(s); if (typeof el.click === 'function') el.click(); else el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }, sel);
  await wait(60);
};
const until = async (fn, ms = 12000, arg) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await ev(fn, arg)) return; await wait(50); }
  throw new Error('timeout: ' + fn.toString().slice(0, 90));
};
const dlgText = () => ev(() => document.getElementById('dText').textContent);
// 대사를 끝까지 (Enter — 키보드 진행 확인 겸). 지나간 대사를 모아 돌려줌
const dialogs = async (max = 60) => {
  const seen = [];
  for (let i = 0; i < max; i++) {
    if (!(await ev(() => S.dialogActive))) return seen.join(' / ');
    await ev(() => Dialog.typing && Dialog.finishLine());
    const t = await dlgText(); if (seen[seen.length - 1] !== t) seen.push(t);
    await page.keyboard.press('Enter'); await wait(25);
  }
  return seen.join(' / ');
};
const overlayText = () => ev(() => document.getElementById('overlay').textContent + ' ' + document.getElementById('actBar').textContent);
const pickOpt = async i => { await page.waitForSelector(`#overlay .opts .btn[data-i="${i}"]`); await click(`#overlay .opts .btn[data-i="${i}"]`); };
// [조금 더 올라가기] 누르고 있기 → 관찰 지점에서 저절로 멈출 때까지
const holdUntilStop = async (ms = 15000) => {
  await page.waitForSelector('#holdBtn', { timeout: 8000 });
  await wait(80);
  const bb = await (await page.$('#holdBtn')).boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.mouse.down();
  await until(() => !document.getElementById('holdBtn') || S.dialogActive, ms);
  await page.mouse.up();
  await wait(60);
};
const noHScroll = async () => { const sw = await ev(() => document.documentElement.scrollWidth); if (sw > VW + 1) throw new Error('가로 스크롤 ' + sw); };
// 대화창·조작 막대가 뭉게를 가리지 않는지 (중요한 장면에서 팝업이 가리지 않음)
const notCovered = async () => {
  const r = await ev(() => {
    const d = document.getElementById('dialogBox').getBoundingClientRect(), a = document.getElementById('actBar').getBoundingClientRect();
    return { top: Math.min(S.dialogActive ? d.top : 1e9, document.getElementById('actBar').classList.contains('on') ? a.top : 1e9), my: M.y, mr: M.r, ov: document.getElementById('overlay').classList.contains('on') };
  });
  if (r.ov) throw new Error('패널이 장면을 덮음');
  if (r.my + r.mr * 0.6 > r.top) throw new Error(`대화·조작 막대가 뭉게를 가림 (뭉게 아래 ${Math.round(r.my + r.mr * 0.6)} > 막대 위 ${Math.round(r.top)})`);
};

/* ===================== 처음 화면 ===================== */
await step('처음 화면: 처음 시작 · 이어 하기(저장 없으면 꺼짐) · 장면 선택 · 교사용 보기 · 저장 안내 · 푸터', async () => {
  await shot('00-title');
  const t = await overlayText();
  for (const k of ['처음 시작', '이어 하기', '장면 선택', '교사용 보기', '이 기기의 브라우저에 진행 상황이 저장됩니다.', '연경쌤의 지구과학 실험실 둘러보기']) if (!t.includes(k)) throw new Error('없음: ' + k);
  const ic = await ev(() => ({ svg: !!document.querySelector('link[rel="icon"][type="image/svg+xml"]'), apple: !!document.querySelector('link[rel="apple-touch-icon"]') }));
  if (!ic.svg || !ic.apple) throw new Error('웹앱 아이콘 없음 ' + JSON.stringify(ic));
  if (!(await ev(() => document.getElementById('contBtn').disabled))) throw new Error('저장이 없는데 이어 하기가 켜져 있음');
  await noHScroll();
});
await step('교사용 보기: 장면 바로 열기 · 핵심 설명 다시 보기 · 주소 옵션 안내', async () => {
  await click('#tchBtn');
  const t = await overlayText();
  for (const k of ['장면 바로 열기', '핵심 설명 다시 보기', '?ch=N', '?part=2', '?debug=1']) if (!t.includes(k)) throw new Error('없음: ' + k);
  await click('#overlay [data-c="1"]');
  if (!(await overlayText()).includes('(20 − 12)/8')) throw new Error('핵심 설명이 펼쳐지지 않음');
  await click('#tBack');
});

/* ===================== 1부 ===================== */
let sTop, sD1;
await step('0장 첫 상승: 별빛 없이 첫 조작으로 상승 → 몸이 연속으로 커지고 기온이 내려감, 처음 크기 윤곽', async () => {
  await click('#newBtn');
  await wait(300); await shot('01-start');
  if ((await ev(() => document.getElementById('dName').textContent)) !== '영서 관측소') throw new Error('관측소 대사로 시작하지 않음');
  // 타이핑 중 탭 → 문장 전체, 자동으로 넘어가지 않음
  if (!(await ev(() => Dialog.typing))) throw new Error('타이핑 효과 없음');
  await page.keyboard.press('Enter'); await wait(50);
  if (await ev(() => Dialog.typing)) throw new Error('탭해도 문장이 다 나오지 않음');
  const i0 = await ev(() => Dialog.idx); await wait(1500);
  if ((await ev(() => Dialog.idx)) !== i0) throw new Error('대사가 저절로 넘어감');
  const txt = await dialogs();
  for (const k of ['바람이 나를 산비탈 쪽으로 밀어 올리고 있어.', '나를 잡아서 조금 올려줄래?']) if (!txt.includes(k)) throw new Error('없음: ' + k);
  if (/별빛|별을/.test(txt)) throw new Error('별빛 도입이 남아 있음');
  const s0 = await ev(() => M.s);
  if (Math.abs(s0 - 1) > 1e-6) throw new Error('출발 크기 배율 ≠ 1: ' + s0);
  // 누르고 있는 동안 크기를 여러 번 재서 연속적으로 커지는지
  await page.waitForSelector('#holdBtn');
  const bb = await (await page.$('#holdBtn')).boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down();
  const samples = [];
  for (let i = 0; i < 12; i++) { samples.push(await ev(() => ({ h: Sim.h, s: M.s, T: Sim.T, ring: M.ring }))); await wait(110); }
  await until(() => !document.getElementById('holdBtn') || S.dialogActive);
  await page.mouse.up();
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].s < samples[i - 1].s - 1e-9) throw new Error('크기가 줄어듦');
    if (samples[i].s - samples[i - 1].s > 0.05) throw new Error('크기가 한꺼번에 튐 ' + (samples[i].s - samples[i - 1].s).toFixed(3));
  }
  if (!samples.some(p => p.ring > 0)) throw new Error('처음 크기 점선 윤곽이 나오지 않음');
  const st = await ev(() => ({ h: Sim.h, T: Sim.T, Td: Sim.Td, s: M.s }));
  if (Math.abs(st.h - 0.5) > 1e-9 || st.T !== 15 || st.Td !== 11) throw new Error('0.5 km 관찰 지점 값: ' + JSON.stringify(st));
  if (!(st.s > 1.05)) throw new Error('몸이 커지지 않음 ' + st.s);
  await shot('02-h05');
  await notCovered();
  const t2 = await dialogs();
  for (const k of ['어? 몸이 좀 커졌는데?', '그런데 기온은 내려갔네.', '높이 올라오니 주변 기압이 낮아졌어.', '공기가 팽창하면서 주변을 밀어내는 일을 해 기온이 내려가는 거야.', '단열 팽창', '건조 단열 감률', '수증기압']) if (!t2.includes(k)) throw new Error('없음: ' + k);
  // 높은 곳에서 머무는 동안 크기 유지
  const sA = await ev(() => M.s); await wait(900);
  if (Math.abs((await ev(() => M.s)) - sA) > 1e-9) throw new Error('멈춰 있는데 크기가 변함');
});
await step('속 들여다보기: 알갱이 수는 그대로, 간격만 · 공기 알갱이와 물방울 구별 (선택 버튼)', async () => {
  if (!(await overlayText()).includes('다음 이야기')) throw new Error('다음 이야기 버튼 없음');
  await click('#peekBtn');
  if (!(await ev(() => Peek.on))) throw new Error('들여다보기 창이 열리지 않음');
  await wait(200); await shot('03-peek');
  await click('#peekBtn');
  await click('#nextBtn');
});

await step('1장 응결: 예상(기온 = 이슬점 직전) → 서툰 조작에도 진행 → 물방울은 포화 순간에 · 피드백은 관찰과 연결', async () => {
  await dialogs();
  await page.waitForSelector('#overlay .opts');
  if (!(await overlayText()).includes('기온과 이슬점이 같아지는 높이')) throw new Error('응결 직전 예상 질문 없음');
  await pickOpt(0);   // 0.75 km (틀린 예상도 그대로 진행)
  await page.waitForSelector('#holdBtn');
  // 서툰 조작: 톡톡 누르기(키보드 Enter)만으로도 진행
  for (let i = 0; i < 2; i++) { await ev(() => document.getElementById('holdBtn') && document.getElementById('holdBtn').focus()); await page.keyboard.press('Enter'); await wait(650); }
  const hNow = await ev(() => Sim.h);
  if (!(hNow > 0.6)) throw new Error('톡 누르기로 올라가지 않음 ' + hNow);
  // 응결 직전(포화 전)에는 물방울 없음
  const pre = await ev(() => ({ h: Sim.h, d: M.drops, sat: Sim.sat }));
  if (pre.h < 1 && (pre.d > 0 || pre.sat)) throw new Error('포화 전에 물방울이 보임 ' + JSON.stringify(pre));
  await holdUntilStop();
  const st = await ev(() => ({ h: Sim.h, T: Sim.T, Td: Sim.Td, d: M.drops, sat: Sim.sat }));
  if (st.h !== 1 || st.T !== 10 || st.Td !== 10 || !st.sat || !(st.d > 0)) throw new Error('응결 순간 상태: ' + JSON.stringify(st));
  await wait(200); await shot('04-lcl');
  await notCovered();
  const t = await dialogs();
  for (const k of ['잠깐, 내 안에 작은 물방울이 보여!', '이 물방울들이 모여 구름으로 보이는 거구나.', '실제로는 1.0 km']) if (!t.includes(k)) throw new Error('없음: ' + k);
  if (/구름이 됐|구름이 되었/.test(t)) throw new Error('뭉게가 구름이 되었다고 말함');
  await click('#nextBtn');
});

await step('새로고침 뒤 이어 하기: 저장된 장면(2장)에서 다시 시작, 관찰 기록·예상 유지', async () => {
  await wait(300);
  await page.reload(); await wait(700);
  const t = await overlayText();
  if (!t.includes('구름 속으로 · 정상까지')) throw new Error('이어 하기에 저장 장면 이름 없음');
  if (await ev(() => document.getElementById('contBtn').disabled)) throw new Error('이어 하기가 꺼져 있음');
  await click('#contBtn');
  const r = await ev(() => ({ ch: S.chapter, lcl: S.rec.obs.some(o => o.id === 'lcl' && !o.summary), cond: Trail.condensed, p1: !!S.rec.pred.p1 }));
  if (r.ch !== 2 || !r.lcl || !r.cond || !r.p1) throw new Error(JSON.stringify(r));
});

await step('대화 중에도 소리 버튼이 실제로 눌림 (화면 좌표 클릭 · 대화는 넘어가지 않음)', async () => {
  await until(() => S.dialogActive);
  const idx = await ev(() => Dialog.idx);
  const bb = await (await page.$('#muteBtn')).boundingBox();
  await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  const r = await ev(() => ({ s: S.set.sound, idx: Dialog.idx, act: S.dialogActive }));
  if (r.s !== false || r.idx !== idx || !r.act) throw new Error(JSON.stringify(r));
  await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  if (!(await ev(() => S.set.sound))) throw new Error('다시 켜지지 않음');
});
await step('설정: 대사 바로 표시 · 소리 끄기 (저장됨)', async () => {
  await click('#setBtn');
  await click('#sheet [data-k="typing"][data-v="off"]');
  await click('#sheet [data-k="sound"][data-v="false"]');
  const r = await ev(() => ({ t: S.set.typing, s: S.set.sound, m: AudioSys.muted, saved: JSON.parse(localStorage.getItem(SAVE_KEY)).set }));
  if (r.t !== 'off' || r.s !== false || !r.m || r.saved.sound !== false) throw new Error(JSON.stringify(r));
  await click('#shClose');
});

await step('관찰 기록 창: 대화 중에 열고 닫아도 그대로 · 여정 지도 번호·목록 · 그래프 점으로 다시 보기', async () => {
  await until(() => S.dialogActive);
  const before = await ev(() => ({ idx: Dialog.idx, ch: S.chapter }));
  const lb = await (await page.$('#logBtn')).boundingBox();
  await page.mouse.click(lb.x + lb.width / 2, lb.y + lb.height / 2);
  await page.waitForSelector('#sheet.on');
  await wait(150); await shot('05-log');
  const t = await ev(() => document.getElementById('sheet').textContent);
  for (const k of ['관찰 기록', '출발 · 영동 바다 위', '응결 시작', '태백산맥', '영서']) if (!t.includes(k)) throw new Error('없음: ' + k);
  await click('#sheet [data-tab="graph"]');
  await click('#sheet .pin[data-id="lcl"]');
  if (!(await ev(() => document.getElementById('sheet').textContent)).includes('기온 10℃ · 이슬점 10℃')) throw new Error('그래프 점을 눌러도 기록이 안 나옴');
  await shot('05b-log-graph');
  await click('#shClose');
  const after = await ev(() => ({ idx: Dialog.idx, ch: S.chapter, act: S.dialogActive, p: S.paused }));
  if (after.idx !== before.idx || after.ch !== before.ch || !after.act || after.p) throw new Error(JSON.stringify({ before, after }));
});

await step('🏠 버튼: 대화 중에도 눌림 → 확인 창 → 계속하기면 그대로 이어짐', async () => {
  await until(() => S.dialogActive);
  const idx = await ev(() => Dialog.idx);
  const hb = await (await page.$('#homeBtn')).boundingBox();
  await page.mouse.click(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.waitForSelector('#sheet.on');
  if (!(await ev(() => document.getElementById('sheet').textContent.includes('처음 화면으로 갈까요?')))) throw new Error('확인 창 없음');
  await shot('05c-home');
  await click('#homeNoBtn');
  const r = await ev(() => ({ idx: Dialog.idx, act: S.dialogActive, p: S.paused, scr: S.screen }));
  if (r.idx !== idx || !r.act || r.p || r.scr !== 'play') throw new Error(JSON.stringify(r));
});
await step('2장 정상까지: 끌기로도 이동 · 응결 뒤에도 팽창 계속 · 응결열 설명', async () => {
  await dialogs();
  await page.waitForSelector('#holdBtn');
  const p = await ev(() => ({ x: M.x, y: M.y }));
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(p.x, p.y - i * 12); await wait(60); }
  await wait(300); await page.mouse.up();
  const h1 = await ev(() => Sim.h);
  if (!(h1 > 1.02)) throw new Error('끌기로 올라가지 않음 ' + h1);
  const s1 = await ev(() => M.s);
  await holdUntilStop();
  sTop = await ev(() => M.s);
  const st = await ev(() => ({ h: Sim.h, T: Sim.T, Td: Sim.Td, d: M.drops }));
  if (st.h !== 2 || st.T !== 5 || st.Td !== 5) throw new Error('정상 상태 ' + JSON.stringify(st));
  if (!(sTop > s1)) throw new Error('응결 뒤 팽창이 멈춤');
  await shot('06-top');
  const t = await dialogs();
  for (const k of ['전망은 좋은데… 꽤 춥네.', '수증기가 물방울로 변하면서 열을 내놓기 때문이야.', '숨은열(잠열)', '습윤 단열 감률']) if (!t.includes(k)) throw new Error('없음: ' + k);
  await click('#nextBtn');
});

await step('3장 구름 속: 물방울이 자라 비로 떨어짐 (박자 놀이 없음) → 물방울 0, 증발 대사 없음', async () => {
  await dialogs();
  if (!(await ev(() => Peek.on))) throw new Error('들여다보기 창이 열려 있지 않음');
  await click('#rainBtn');
  await wait(2000); await shot('07-rain');
  await until(() => S.dialogActive, 12000);
  const t = await dialogs();
  const d = await ev(() => M.drops);
  if (d !== 0) throw new Error('비가 내린 뒤에도 물방울 ' + d);
  if (/증발/.test(t)) throw new Error('증발 대사가 나옴');
  if (!t.includes('비')) throw new Error('강수 설명 없음');
  if (await ev(() => typeof RainSong !== 'undefined' || !!document.getElementById('hearts'))) throw new Error('리듬 놀이·하트가 남아 있음');
  await click('#nextBtn');
});

await step('4장 내려가기: 같은 높이로 내려가기 전 예상 → 1 km 15℃(작아짐·따뜻해짐) → 도착', async () => {
  await dialogs();
  await page.waitForSelector('#overlay .opts');
  if (!(await overlayText()).includes('같은 1.0 km')) throw new Error('하강 전 예상 질문 없음');
  await pickOpt(0);   // 10℃ (틀린 예상)
  await holdUntilStop();
  // 정상에서 조금 내려온 1.9 km: 물방울이 없으니 곧바로 불포화 (교과서 가정을 직접 확인)
  const u1 = await ev(() => ({ h: Sim.h, T: Sim.T, Td: Sim.Td, sat: Sim.sat, d: M.drops }));
  if (Math.abs(u1.h - 1.9) > 1e-6 || Math.abs(u1.T - 6) > 1e-6 || Math.abs(u1.Td - 5.2) > 1e-6 || u1.sat || u1.d !== 0) throw new Error('1.9 km 상태 ' + JSON.stringify(u1));
  const tu = await dialogs();
  for (const k of ['벌써 기온이 이슬점보다 높아졌어', '불포화 상태', '만약 내 안에 물방울이 남아 있었다면']) if (!tu.includes(k)) throw new Error('없음: ' + k);
  await holdUntilStop();
  sD1 = await ev(() => M.s);
  const st = await ev(() => ({ h: Sim.h, T: Sim.T, Td: Sim.Td, d: M.drops }));
  if (st.h !== 1 || st.T !== 15 || st.Td !== 7 || st.d !== 0) throw new Error('하강 1 km 상태 ' + JSON.stringify(st));
  if (!(sD1 < sTop)) throw new Error('내려와도 작아지지 않음');
  await shot('08-d1');
  await notCovered();
  const t = await dialogs();
  for (const k of ['같은 높이인데, 올라올 때보다 따뜻하잖아?', '같은 높이로 돌아왔는데 기온은 달라졌네.', '올라갈 때와 내려올 때 기온이 변한 과정을 비교해 보자.', '주변 기압이 높아지면서 압축되고, 기온이 올라가고 있어.']) if (!t.includes(k)) throw new Error('없음: ' + k);
  await holdUntilStop();
  const a = await ev(() => ({ h: Sim.h, T: Sim.T, Td: Sim.Td, s: M.s }));
  if (a.h !== 0 || a.T !== 25 || a.Td !== 9) throw new Error('도착 상태 ' + JSON.stringify(a));
  if (!(a.s < sD1 && a.s > 1 && a.s < 1.08)) throw new Error('도착 크기(처음과 거의 같고 아주 조금 큼) ' + a.s);
  const t2 = await dialogs();
  if (!t2.includes('다녀왔습니다.')) throw new Error('도착 반응 없음');
  await click('#nextBtn');
});

await step('5장 비교: 출발과 도착을 그래프와 함께 나란히 → 푄(높새바람)', async () => {
  const t0 = await dialogs();
  if (!t0.includes('같은 높이인데, 출발할 때보다 따뜻하잖아?')) throw new Error('도착 비교 반응 없음');
  await page.waitForSelector('#overlay .cmpWrap');
  const t = await overlayText();
  for (const k of ['출발 · 영동 0 km', '도착 · 영서 0 km', '20℃', '25℃', '9℃', '구름 속(1~2 km): 1 km에 5℃만 식음', '더 따뜻해진 까닭']) if (!t.includes(k)) throw new Error('없음: ' + k);
  if (!(await ev(() => !!document.querySelector('#overlay .cmpGraph svg')))) throw new Error('비교 그래프 없음');
  await shot('09-compare');
  await click('#cmpNext');
  const t2 = await dialogs();
  if (!t2.includes('높새바람')) throw new Error('높새바람 설명 없음');
  await click('#nextBtn');
});

await step('6장 관측소 보고: 그림 Ⅲ-13 빈칸은 선택 (채우지 않아도 계속) → 1부 정리', async () => {
  await dialogs();
  await page.waitForSelector('#overlay .f13');
  if (!(await overlayText()).includes('내 관찰 기록')) throw new Error('빈칸 옆 근거 관찰값 없음');
  await click('#overlay .blank[data-bi="3"]');
  const ev3 = await overlayText();
  for (const k of ['100%', '59%', '36%']) if (!ev3.includes(k)) throw new Error('내려올 때 상대 습도 근거 없음: ' + k);
  await click('#overlay .blank[data-bi="0"]');
  await click('#overlay .opts .btn[data-o="불포화"]');
  if (!(await overlayText()).includes('맞아!')) throw new Error('빈칸 피드백 없음');
  await shot('10-f13');
  await click('#f13Done');
  await page.waitForSelector('#cpP2');
  await click('#cpP2');
});

/* ===================== 2부 ===================== */
await step('8장 대기 A: 새 출발 조건 안내 → 손으로 올리기 → 같은 높이 비교 → 놓기 전 예상 → 돌아옴 → 다시 해 보기', async () => {
  const t0 = await dialogs();
  if (!t0.includes('출발할 때의 나(20℃ · 12℃)')) throw new Error('새 출발 조건 안내 없음');
  if (!(await ev(() => !document.getElementById('mEnv').classList.contains('off') && document.getElementById('mRH').classList.contains('off')))) throw new Error('2부 관찰값(주위 기온) 전환 안 됨');
  await holdUntilStop();
  await dialogs();
  await page.waitForSelector('#overlay .opts');
  const q = await overlayText();
  if (!q.includes('뭉게 15℃') || !q.includes('주위 18℃')) throw new Error('같은 높이 두 기온이 질문에 없음');
  await pickOpt(0);   // 올라간다 (틀린 예상)
  await shot('11-A-before');
  await click('#relBtn');
  await wait(700); await shot('12-A-release');
  await until(() => S.dialogActive, 15000);
  const t = await dialogs();
  for (const k of ['방금 출발했는데 벌써 돌아왔네.', '주위보다 차가운 공기는 밀도가 커서']) if (!t.includes(k)) throw new Error('없음: ' + k);
  if (/팽창해서 (올라|뜨)/.test(t)) throw new Error('팽창 때문에 오른다고 설명함');
  if ((await ev(() => S.rec.p2.A.out)) !== 'return') throw new Error('대기 A 결과');
  await click('#again0');
  await holdUntilStop();
  await click('#relBtn');
  await until(() => document.getElementById('nextBtn'), 15000);
  await click('#nextBtn');
});
await step('9장 대기 C: 같은 0.5 km인데 계속 올라감 (화면 위 도달은 판정에 쓰지 않음)', async () => {
  await dialogs();
  await holdUntilStop();
  await dialogs();
  await pickOpt(0);
  await click('#relBtn');
  await until(() => S.dialogActive, 15000);
  const t = await dialogs();
  if (!t.includes('어, 손을 놓았는데도 계속 올라가!')) throw new Error('상승 반응 없음');
  if ((await ev(() => S.rec.p2.C.out)) !== 'rise') throw new Error('대기 C 결과');
  await click('#nextBtn');
});
await step('10장 대기 B: 1 km 돌아옴 · 2 km 올라감 → 두 기온 그래프로 자유 대류 고도', async () => {
  await dialogs();
  await holdUntilStop(); await dialogs(); await pickOpt(2); await click('#relBtn');
  await until(() => S.dialogActive, 15000); await dialogs();
  await holdUntilStop(); await dialogs(); await pickOpt(0); await click('#relBtn');
  await until(() => S.dialogActive, 15000); await dialogs();
  await page.waitForSelector('#agNext');
  await shot('13-B-graph');
  await click('#agNext');
  const t = await dialogs();
  if (!t.includes('자유 대류 고도')) throw new Error('자유 대류 고도 설명 없음');
  const r = await ev(() => [S.rec.p2.B1.out, S.rec.p2.B2.out]);
  if (r[0] !== 'return' || r[1] !== 'rise') throw new Error('대기 B 결과 ' + r);
  await click('#nextBtn');
});
await step('11장 이름 붙이기와 구름: 관찰 뒤 이름 (판정 질문 없음) → 층운형·적운형', async () => {
  await dialogs();
  await page.waitForSelector('#nmNext');
  const t = await overlayText();
  for (const k of ['절대 안정', '조건부 불안정', '절대 불안정']) if (!t.includes(k)) throw new Error('없음: ' + k);
  await click('#nmNext');
  const t2 = await dialogs();
  for (const k of ['층운형', '적운형']) if (!t2.includes(k)) throw new Error('없음: ' + k);
  await shot('14-clouds');
  await click('#nextBtn');
});
await step('12장 대기 D: 새 조건 안내 → 1 km 돌아옴 · 2 km 올라감 → 학습 기록', async () => {
  const t0 = await dialogs();
  if (!t0.includes('26℃')) throw new Error('새 출발 조건 안내 없음');
  await holdUntilStop(); await dialogs(); await pickOpt(2); await click('#relBtn');
  await until(() => S.dialogActive, 15000); await dialogs();
  await holdUntilStop(); await dialogs(); await pickOpt(0); await click('#relBtn');
  await until(() => S.dialogActive, 15000); await dialogs();
  const r = await ev(() => [S.rec.p2.D1.out, S.rec.p2.D2.out]);
  if (r[0] !== 'return' || r[1] !== 'rise') throw new Error('대기 D 결과 ' + r);
  await click('#nextBtn');
  await page.waitForSelector('#overlay .resT');
  const t = await overlayText();
  for (const k of ['학습 기록', '처음 예상', '관찰한 값']) if (!t.includes(k)) throw new Error('없음: ' + k);
  await shot('15-results');
});

await step('2부 자유 실험 (선택): 감률·놓는 높이를 바꿔 바로 확인', async () => {
  await click('#toFree');
  await click('#fsUp');
  await click('#fsGo');
  if (!(await ev(() => document.getElementById('fsMsg').textContent)).includes('km: 뭉게')) throw new Error('자유 실험 결과 없음');
  await click('#fsEnd');
  await page.waitForSelector('#overlay .resT');
});
await step('다른 조건의 여행 (선택, 목표 과제 없음): 조건 바꿔 보내기 → 비교표', async () => {
  await ev(() => startFrom(7));
  await dialogs();
  await page.waitForSelector('#labPanel [data-p="1"]');
  await click('#labPanel [data-p="1"]');   // 이슬점 16℃
  await click('#labGo');
  await until(() => S.rec.lab.length > 0, 12000);
  const t = await ev(() => document.getElementById('labPanel').textContent);
  if (!t.includes('27.5℃')) throw new Error('이슬점 16℃ · 산 2 km 도착 27.5℃가 없음: ' + t.slice(0, 120));
  await shot('16-lab');
  await click('#labEnd');
  await page.waitForSelector('#overlay .resT');
});
await step('장면 선택으로 중간부터: 앞 장 기록은 ‘앞선 여정 요약’으로 구별 · 움직임 줄이기', async () => {
  await ev(() => { localStorage.clear(); S.rec = newRecord(); Trail.reset(); S.started = false; });
  await click('#resTitle');
  await click('#selBtn');
  await click('#overlay [data-ch="4"]');
  const r = await ev(() => ({ ch: S.chapter, sum: S.rec.obs.filter(o => o.summary).map(o => o.id), obs: S.rec.obs.filter(o => !o.summary).length, sumUp: Trail.sumUp }));
  if (r.ch !== 4 || r.obs !== 0 || !r.sum.includes('top') || r.sumUp !== 2) throw new Error(JSON.stringify(r));
  await click('#setBtn');
  await click('#sheet [data-k="reduce"][data-v="true"]');
  if (!(await ev(() => document.body.classList.contains('reduce')))) throw new Error('움직임 줄이기가 적용되지 않음');
  await click('#sheet [data-k="reduce"][data-v="false"]');
  await click('#shClose');
  await click('#logBtn');
  if (!(await ev(() => document.getElementById('sheet').textContent.includes('앞선 여정 요약')))) throw new Error('요약 표시 없음');
  await click('#shClose');
  await ev(() => showTitle());
});

await step('새로고침 뒤 설정 유지 · 처음 시작 전 확인 창 · 콘솔 오류·가로 스크롤 없음', async () => {
  await page.reload(); await wait(600);
  const r = await ev(() => ({ s: S.set.sound, m: AudioSys.muted, t: S.set.typing, cont: !document.getElementById('contBtn').disabled }));
  if (r.s !== false || !r.m || r.t !== 'off' || !r.cont) throw new Error('새로고침 뒤 설정·이어 하기 ' + JSON.stringify(r));
  await click('#newBtn');
  if (!(await overlayText()).includes('처음부터 시작할까요?')) throw new Error('지우기 전 확인 창 없음');
  await click('#cfNo');
  // 이어 하기 → 대화 중 🏠 → 처음 화면으로
  await click('#contBtn');
  await until(() => S.dialogActive);
  const hb = await (await page.$('#homeBtn')).boundingBox();
  await page.mouse.click(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await click('#homeYesBtn');
  if ((await ev(() => S.screen)) !== 'title' || !(await overlayText()).includes('처음 시작')) throw new Error('처음 화면으로 돌아가지 않음');
  if (!(await ev(() => !!document.querySelector('.titleFace svg .mg')))) throw new Error('처음 화면 뭉게 캐릭터 없음');
  await noHScroll();
  if (errors.length) throw new Error(errors.join(' | '));
});

console.log(failed === 0 ? '\n본편 전체 진행 테스트 통과 🎉' : `\n${failed}개 단계 실패`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
