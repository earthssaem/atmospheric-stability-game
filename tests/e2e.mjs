// 전체 챕터 관통 스모크 테스트 (headless Chromium)
// 실행: npm run test:e2e   (사전: npm install — playwright 설치)
// 시스템 크로미움을 쓰려면 CHROMIUM_PATH=/path/to/chrome 환경변수로 지정
import { chromium } from 'playwright';

const errors = [];
const launchOpts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1024, height: 700 } });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => {
  if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push('console: ' + m.text());
});

await page.goto(new URL('../index.html', import.meta.url).href);
await page.waitForTimeout(800);

let failed = 0;
const step = async (name, fn) => {
  try { await fn(); console.log('✅', name); }
  catch (e) { console.log('❌', name, '—', e.message.split('\n')[0]); failed++; }
};

const press = id => page.evaluate(id => {
  const el = document.getElementById(id);
  if (el) el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
}, id);
const tapDialog = () => page.evaluate(() =>
  document.getElementById('dialogWrap').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));

// 대화/지도/중간 버튼을 계속 눌러 chapter n 의 플레이 상태까지 진행
async function toChapter(n, timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const st = await page.evaluate(() => ({
      ch: S.chapter, dlg: S.dialogActive, paused: S.paused,
      btns: ['mapNextBtn', 'toGraphBtn', 'graphDoneBtn'].filter(id => document.getElementById(id)),
    }));
    if (st.ch === n && !st.dlg && !st.paused) return;
    if (st.dlg) await tapDialog();
    else if (st.btns.length) await press(st.btns[0]);
    await page.waitForTimeout(150);
  }
  const ch = await page.evaluate(() => S.chapter);
  throw new Error(`timeout: chapter=${ch}, expected ${n}`);
}
const meters = () => page.evaluate(() => ({
  alt: document.querySelector('#mAlt .val').textContent,
  T: document.querySelector('#mT .val').textContent,
  Td: document.querySelector('#mTd .val').textContent,
}));
const miniGraphOn = () => page.evaluate(() => document.getElementById('miniGraph').classList.contains('on'));

await step('타이틀 화면 표시', () => page.waitForSelector('#startBtn'));

await step('게임 시작 → 0장 플레이', async () => {
  await press('startBtn');
  await toChapter(0);
});

await step('0장: 미니 그래프 숨김 (데이터 없음)', async () => {
  if (await miniGraphOn()) throw new Error('0장에서 미니 그래프가 숨겨져야 함');
});

await step('0장: 반짝이 3개 수집 → 1장', async () => {
  for (const i of [0, 1, 2]) {
    await page.evaluate(i => {
      const sp = Ch0Scene.sparks[i];
      M.place(sp.fx * innerWidth, sp.fy * innerHeight);
    }, i);
    await page.waitForTimeout(300);
  }
  await toChapter(1);
});

await step('1장: 미니 그래프 표시 + 인트로 직후 계기판이 1장 값(0.08km/19.2℃)', async () => {
  if (!await miniGraphOn()) throw new Error('1장에서 미니 그래프가 보여야 함');
  const m = await meters();
  if (!m.T.startsWith('19.')) throw new Error('계기판이 이전 챕터 값: ' + JSON.stringify(m));
});

await step('1장: HUD 물리값 (0.5km→15℃/11℃)', async () => {
  await page.evaluate(() => { M.place(M.x, Ch1Scene.map.kmToY(0.5)); });
  await page.waitForTimeout(250);
  const m = await meters();
  if (!m.alt.startsWith('0.50') || !m.T.startsWith('15.0') || !m.Td.startsWith('11.0'))
    throw new Error(JSON.stringify(m));
});

await step('1장: 오버슈트 → 하트 -1 + 흔들림', async () => {
  const before = await page.evaluate(() => S.hearts);
  await page.evaluate(() => { M.place(M.x, Ch1Scene.map.kmToY(1.7)); });
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => S.hearts);
  if (after !== before - 1) throw new Error(`hearts ${before}→${after}`);
});

await step('1장: 목표 존 3초 유지 → 2장', async () => {
  await page.evaluate(() => { M.place(M.x, Ch1Scene.map.kmToY(1.0)); });
  await page.waitForTimeout(3600);
  await toChapter(2);
});

await step('발자국: 상승 기록 누적 + 미니 그래프 경로 (2장 진입 시점)', async () => {
  const r = await page.evaluate(() => ({
    maxUp: Trail.maxUpAlt, condensed: Trail.condensed,
    on: document.getElementById('miniGraph').classList.contains('on'),
    dT: document.getElementById('mgUpT').getAttribute('d'),
  }));
  if (r.maxUp < 1.0) throw new Error(`maxUpAlt=${r.maxUp}`);
  if (!r.condensed) throw new Error('응결 마커 없음');
  if (!r.on) throw new Error('2장 미니 그래프 미표시');
  // 1.0km 초과분이 있으므로 기온선은 꺾인 3점 경로 (M + L + L)
  if ((r.dT.match(/L/g) || []).length < 2) throw new Error('기온선 꺾임 없음: ' + r.dT);
});

await step('발자국: trailUpPoints(1.5) = (20,0)→(10,1)→(7.5,1.5)', async () => {
  const ok = await page.evaluate(() => {
    const p = trailUpPoints(20, 12, 1.5);
    const want = { T: [[20, 0], [10, 1], [7.5, 1.5]], Td: [[12, 0], [10, 1], [7.5, 1.5]] };
    return JSON.stringify(p) === JSON.stringify(want);
  });
  if (!ok) throw new Error('trailUpPoints 불일치');
});

await step('2장: 응결 존 2초 → 구름 옷 → 3장', async () => {
  await page.evaluate(() => { M.place(M.x, Ch2Scene.map.kmToY(1.0)); });
  await page.waitForTimeout(2600);
  const coat = await page.evaluate(() => M.coat);
  if (!coat) throw new Error('구름 옷 미착용');
  await toChapter(3);
});

await step('3장: 가이드 밴드 따라 정상 → 4장', async () => {
  for (let x = 0.3; x <= 3.9; x += 0.1) {
    if (await page.evaluate(() => S.dialogActive)) { // 감률 변화 대사
      await tapDialog();
      await page.waitForTimeout(150);
      await page.evaluate(() => { if (S.dialogActive) Dialog.tap(); });
    }
    const done = await page.evaluate(() => S.chapter !== 3 || !Ch3Scene.playing);
    if (done) break;
    await page.evaluate(x => {
      const p = Ch3Scene.w2s(x, Ch3Scene.bandCenter(x));
      M.place(p.x, p.y);
    }, x);
    await page.waitForTimeout(90);
  }
  await toChapter(4);
});

await step('4장: HUD = 정상 2.0 km · 5℃', async () => {
  const m = await meters();
  if (!m.alt.startsWith('2.00') || !m.T.startsWith('5.0')) throw new Error(JSON.stringify(m));
});

await step('팽창: 정상(2km)에서 몸 크기 1.35배', async () => {
  await page.waitForTimeout(1500); // r 스무딩 수렴 대기
  const [r, want] = await page.evaluate(() =>
    [M.r, TUNING.mungge.baseR * (1 + TUNING.mungge.growPerKm * 2)]);
  if (r < want - 4) throw new Error(`r=${r.toFixed(1)}, want≈${want.toFixed(1)}`);
});

await step('4장: 미니 그래프 숨김 (리듬 집중)', async () => {
  if (await miniGraphOn()) throw new Error('4장에서 미니 그래프가 숨겨져야 함');
});

await step('4장: 박자 그리드 동기 (노트 tₖ = t0 + (4+pattern[k])×beat, BGM 박 0 = t0)', async () => {
  await page.waitForFunction(() => Ch4Scene.playing, null, { timeout: 8000 });
  const r = await page.evaluate(() => {
    const s = Ch4Scene, c = TUNING.ch4;
    const gridOk = s.notes.every((n, k) =>
      Math.abs((n.t - s.t0) - (c.countInBeats + c.pattern[k]) * s.beatSec) < 1e-9);
    const bgmOk = !AudioSys.ctx || Math.abs(AudioSys.bgmStartTime - s.t0) < 1e-9;
    return { gridOk, bgmOk, n: s.notes.length };
  });
  if (!r.gridOk) throw new Error('노트-박자 그리드 불일치');
  if (!r.bgmOk) throw new Error('BGM 박 0 ≠ t0');
  if (r.n !== 20) throw new Error(`notes=${r.n}`);
});

await step('4장: 리듬 노트 자동 연주(14+ 성공) → 5장', async () => {
  await page.evaluate(() => {
    window.__auto = setInterval(() => {
      const sc = Ch4Scene;
      if (!sc.playing) return;
      const now = AudioSys.now() - TUNING.ch4.audioOffset;
      const n = sc.notes.find(n => !n.hit && !n.miss && Math.abs(now - n.t) < 0.06);
      if (n) { sc.lastTap = -9; sc.pd(0, 0); }
    }, 25);
  });
  await page.waitForFunction(() => Ch4Scene.hits + Ch4Scene.misses >= 20, null, { timeout: 40000 });
  await page.evaluate(() => clearInterval(window.__auto));
  const [hits, misses] = await page.evaluate(() => [Ch4Scene.hits, Ch4Scene.misses]);
  console.log(`   (hits=${hits}, misses=${misses})`);
  if (hits < 14) throw new Error(`hits=${hits}`);
  await toChapter(5);
});

await step('5장: 미니 그래프 표시 + 하강 HUD (1.0km→15℃/7℃)', async () => {
  if (!await miniGraphOn()) throw new Error('5장에서 미니 그래프가 보여야 함');
  await page.evaluate(() => {
    const p = Ch5Scene.w2s(1.8, 1.0);
    M.place(p.x, p.y); M.held = true;
  });
  await page.waitForTimeout(300);
  const m = await meters();
  if (!m.T.startsWith('15.0') || !m.Td.startsWith('7.0')) throw new Error(JSON.stringify(m));
});

await step('5장: 착지 존 저속 착지 (지표 25℃/9℃) → 6장', async () => {
  await page.evaluate(() => {
    const p = Ch5Scene.w2s(3.6, 0.25);
    M.place(p.x, p.y); M.held = true;
  });
  for (let h = 0.22; h >= -0.02; h -= 0.03) {
    await page.evaluate(h => {
      const p = Ch5Scene.w2s(3.6, h);
      M.tx = p.x; M.ty = p.y;
    }, Math.max(0, h));
    await page.waitForTimeout(130);
  }
  await page.waitForTimeout(800);
  const m = await meters();
  if (!m.T.startsWith('25.0') || !m.Td.startsWith('9.0')) throw new Error(JSON.stringify(m));
  await toChapter(6);
});

await step('압축: 착지 후 몸 크기 원래대로 (r<50px)', async () => {
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => M.r);
  if (r > 50) throw new Error(`r=${r.toFixed(1)} — 하강 후에도 큼`);
});

await step('발자국: 하강 기록 (minDownAlt≈0, 분홍 하강선)', async () => {
  const r = await page.evaluate(() => ({
    down: Trail.downStarted, minDown: Trail.minDownAlt,
    dDn: document.getElementById('mgDnT').getAttribute('d'),
  }));
  if (!r.down) throw new Error('downStarted=false');
  if (r.minDown > 0.1) throw new Error(`minDownAlt=${r.minDown}`);
  if (!r.dDn || !r.dDn.startsWith('M')) throw new Error('하강선 미기록');
});

await step('6장: 비교 카드 + 그래프 리플레이 → 7장', async () => {
  if (await miniGraphOn()) throw new Error('6장에서 미니 그래프가 숨겨져야 함');
  await toChapter(7, 30000); // toChapter 가 toGraphBtn/graphDoneBtn 도 눌러 줌
  const panelOn = await page.evaluate(() => document.getElementById('simPanel').classList.contains('on'));
  if (!panelOn) throw new Error('시뮬레이터 패널 미표시');
  if (await miniGraphOn()) throw new Error('7장에서 미니 그래프가 숨겨져야 함');
});

await step('7장: γ=12 쿡 → 절대 불안정(계속 상승)', async () => {
  await page.evaluate(() => { Ch7Scene.setGamma(12); Ch7Scene.poke(); });
  await page.waitForFunction(() => Ch7Scene.verdict !== '', null, { timeout: 8000 });
  const v = await page.evaluate(() => Ch7Scene.verdict);
  if (v !== 'unstable') throw new Error(`verdict=${v}`);
});

await step('7장: γ=4 쿡 → 절대 안정(제자리 복귀)', async () => {
  await page.evaluate(() => {
    Ch7Scene.setGamma(4);
    M.place(M.x, Ch7Scene.map.kmToY(0));
    Ch7Scene.h = 0; Ch7Scene.simV = 0; Ch7Scene.settled = true;
    Ch7Scene.poke();
  });
  await page.waitForFunction(() => Ch7Scene.verdict !== '', null, { timeout: 12000 });
  const v = await page.evaluate(() => Ch7Scene.verdict);
  if (v !== 'stable') throw new Error(`verdict=${v}`);
});

await step('7장: γ=8, 1.9km에서 놓기 → 조건부 상승', async () => {
  await page.evaluate(() => {
    Ch7Scene.setGamma(8);
    M.place(M.x, Ch7Scene.map.kmToY(1.9));
    Ch7Scene.h = 1.9; Ch7Scene.settled = false; Ch7Scene.simV = 0; Ch7Scene.verdict = '';
  });
  await page.waitForFunction(() => Ch7Scene.verdict !== '', null, { timeout: 8000 });
  const v = await page.evaluate(() => Ch7Scene.verdict);
  if (v !== 'unstable') throw new Error(`verdict=${v}`);
});

await step('여행 끝내기 → 수료 화면 (남은 하트 표시)', async () => {
  await press('simEndBtn');
  await page.waitForSelector('#toTitleBtn', { timeout: 5000 });
  const txt = await page.evaluate(() => document.getElementById('overlay').textContent);
  if (!txt.includes('남은 하트')) throw new Error('하트 표시 없음');
});

await step('처음 화면 + 이어하기 활성', async () => {
  await press('toTitleBtn');
  await page.waitForSelector('#contBtn', { timeout: 5000 });
});

if (errors.length) {
  console.log('\n===== JS 오류 =====');
  errors.forEach(e => console.log(' -', e));
}
console.log(failed === 0 && errors.length === 0 ? '\n스모크 테스트 전체 통과 🎉' : `\n실패 ${failed}건 / JS 오류 ${errors.length}건`);
await browser.close();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
