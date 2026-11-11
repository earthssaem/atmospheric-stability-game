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
      pred: !!document.querySelector('.predOpts .btn'),
      table: !!document.getElementById('tableDoneBtn'),
    }));
    if (st.ch === n && !st.dlg && !st.paused) return;
    if (st.dlg) await tapDialog();
    else if (st.pred) await page.evaluate(() => {   // 예측 질문: 정답 고르기
      const P = PREDICTIONS[S.chapter];
      document.querySelector(`.predOpts .btn[data-i="${P.ans}"]`).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    else if (st.table) await page.evaluate(() => { Fig13.solveAll(); document.getElementById('tableDoneBtn').click(); });
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
  // 6장 비교 카드가 뜰 때까지 (대사·여정 지도만 넘김 — 비교 카드·표는 다음 단계에서 직접 검증)
  for (let i = 0; i < 120 && !(await page.evaluate(() => !!document.getElementById('toGraphBtn'))); i++) {
    const st = await page.evaluate(() => ({ dlg: S.dialogActive, map: !!document.getElementById('mapNextBtn') }));
    if (st.dlg) await tapDialog(); else if (st.map) await press('mapNextBtn');
    await page.waitForTimeout(120);
  }
  if (await page.evaluate(() => S.chapter) !== 6) throw new Error('6장 진입 실패');
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

await step('6장: 비교 카드(상대 습도 60%→36%) + 그래프 리플레이', async () => {
  if (await miniGraphOn()) throw new Error('6장에서 미니 그래프가 숨겨져야 함');
  await page.waitForSelector('#toGraphBtn', { timeout: 15000 });
  const txt = await page.evaluate(() => document.getElementById('overlay').textContent);
  if (!txt.includes('60%') || !txt.includes('36%')) throw new Error('비교 카드에 상대 습도 없음');
  await press('toGraphBtn');
  await page.waitForSelector('#graphDoneBtn', { timeout: 5000 });
  await press('graphDoneBtn');
});

await step('6장: 그림 Ⅲ-13 표 — 틀린 카드는 안 들어가고 힌트, 맞는 카드는 채워짐, 다 채워야 계속', async () => {
  await page.waitForSelector('#tableDoneBtn', { timeout: 5000 });
  const r = await page.evaluate(() => {
    const wrong = Fig13.chips.findIndex(c => c.t === '포화');          // ① 공기 상태 칸(정답: 불포화)에 '포화'
    Fig13.pickChip(wrong); Fig13.pickCell(0, 0);
    const afterWrong = { filled: Fig13.filled[0][0], hint: document.getElementById('f13hint').textContent, m: Fig13.mistakes };
    const right = Fig13.chips.findIndex(c => c.t === '불포화' && !c.used);
    Fig13.pickCell(0, 0); Fig13.pickChip(right);                         // 칸 먼저 → 카드
    const afterRight = Fig13.filled[0][0];
    const disabledBefore = document.getElementById('tableDoneBtn').disabled;
    Fig13.solveAll();
    return { afterWrong, afterRight, disabledBefore, disabledAfter: document.getElementById('tableDoneBtn').disabled };
  });
  if (r.afterWrong.filled || r.afterWrong.m !== 1 || !r.afterWrong.hint.includes('불포화')) throw new Error('오답 처리: ' + JSON.stringify(r.afterWrong));
  if (!r.afterRight) throw new Error('정답 카드가 안 들어감');
  if (!r.disabledBefore || r.disabledAfter) throw new Error('계속 버튼 활성 조건 이상 ' + JSON.stringify(r));
  await page.evaluate(() => document.getElementById('tableDoneBtn').click());
});

await step('6장 → 7장 푄 실험실 (패널 표시, 미니 그래프 숨김)', async () => {
  await toChapter(7, 30000);
  const on = await page.evaluate(() => document.getElementById('labPanel').classList.contains('on'));
  if (!on) throw new Error('실험실 패널 미표시');
  if (await miniGraphOn()) throw new Error('7장에서 미니 그래프가 숨겨져야 함');
});

const labSend = async (Td, Mk, guess) => {
  await page.evaluate(([Td, Mk, guess]) => { Ch7Scene.setCond(Td, Mk); Ch7Scene.setGuess(guess); Ch7Scene.send(); }, [Td, Mk, guess]);
  await page.waitForFunction(() => Ch7Scene.result, null, { timeout: 10000 });
  return page.evaluate(() => ({ arr: Ch7Scene.result.arrT, cloud: Ch7Scene.result.cloud, m: { ...Ch7Scene.missions },
    read: document.getElementById('labRead').textContent, meterT: document.querySelector('#mT .val').textContent }));
};
await step('7장: 이슬점 16℃·산 2.5 km, 예측 30℃ → 도착 30℃ (예측 성공, 30℃ 미션)', async () => {
  const r = await labSend(16, 2.5, 30);
  if (r.arr !== 30 || !r.cloud || !r.m.hot30) throw new Error(JSON.stringify(r));
  if (!r.read.includes('예측 성공')) throw new Error(r.read);
  if (!r.meterT.startsWith('30.0')) throw new Error('계기판이 도착 기온이 아님: ' + r.meterT);
});
await step('7장: 이슬점 4℃·산 1.5 km → 구름 없음, 도착 = 출발 20℃ (푄 없음 미션, 예측 2회)', async () => {
  const r = await labSend(4, 1.5, 20);
  if (r.arr !== 20 || r.cloud || !r.m.noFoehn || !r.m.guess2) throw new Error(JSON.stringify(r));
  if (!r.read.includes('푄 없음')) throw new Error(r.read);
});

await step('여행 끝내기 → 수료 화면 (남은 하트 · 보너스 버튼)', async () => {
  await press('labEndBtn');
  await page.waitForSelector('#bonusBtn', { timeout: 5000 });
  const txt = await page.evaluate(() => document.getElementById('overlay').textContent);
  if (!txt.includes('남은 하트')) throw new Error('하트 표시 없음');
});

await step('보너스(대기 안정도) 진입: 시뮬레이터 패널', async () => {
  await press('bonusBtn');
  await toChapter(8, 20000);
  const panelOn = await page.evaluate(() => document.getElementById('simPanel').classList.contains('on'));
  if (!panelOn) throw new Error('시뮬레이터 패널 미표시');
});

await step('보너스: γ=12 쿡 → 절대 불안정(계속 상승)', async () => {
  await page.evaluate(() => { Ch8Scene.setGamma(12); Ch8Scene.poke(); });
  await page.waitForFunction(() => Ch8Scene.verdict !== '', null, { timeout: 8000 });
  const v = await page.evaluate(() => Ch8Scene.verdict);
  if (v !== 'unstable') throw new Error(`verdict=${v}`);
});

await step('보너스: γ=4 쿡 → 절대 안정(제자리 복귀)', async () => {
  await page.evaluate(() => {
    Ch8Scene.setGamma(4);
    M.place(M.x, Ch8Scene.map.kmToY(0));
    Ch8Scene.h = 0; Ch8Scene.simV = 0; Ch8Scene.settled = true;
    Ch8Scene.poke();
  });
  await page.waitForFunction(() => Ch8Scene.verdict !== '', null, { timeout: 12000 });
  const v = await page.evaluate(() => Ch8Scene.verdict);
  if (v !== 'stable') throw new Error(`verdict=${v}`);
});

await step('보너스: γ=8, 1.9km에서 놓기 → 조건부 상승', async () => {
  await page.evaluate(() => {
    Ch8Scene.setGamma(8);
    M.place(M.x, Ch8Scene.map.kmToY(1.9));
    Ch8Scene.h = 1.9; Ch8Scene.settled = false; Ch8Scene.simV = 0; Ch8Scene.verdict = '';
  });
  await page.waitForFunction(() => Ch8Scene.verdict !== '', null, { timeout: 8000 });
  const v = await page.evaluate(() => Ch8Scene.verdict);
  if (v !== 'unstable') throw new Error(`verdict=${v}`);
});

await step('보너스 끝내기 → 수료 화면(보너스 표시) → 처음 화면 + 이어하기', async () => {
  await press('simEndBtn');
  await page.waitForSelector('#toTitleBtn', { timeout: 5000 });
  const txt = await page.evaluate(() => document.getElementById('overlay').textContent);
  if (!txt.includes('대기 안정도(보너스)')) throw new Error('보너스 표시 없음');
  await press('toTitleBtn');
  await page.waitForSelector('#contBtn', { timeout: 5000 });
});

// ===================== v1.3 개선 사항 검증 =====================
const waitPlaying4 = () => page.waitForFunction(() =>
  S.chapter === 4 && Ch4Scene.playing && AudioSys.now() > Ch4Scene.firstNote + 0.3, null, { timeout: 10000 });

await step('처음 화면: 제작자 푸터 + 허브 링크(새 탭)', async () => {
  const f = await page.evaluate(() => {
    const a = document.querySelector('#overlay footer a.hub');
    return a && { href: a.href, target: a.target, rel: a.rel, txt: a.closest('footer').textContent };
  });
  if (!f) throw new Error('푸터/허브 링크 없음');
  if (f.href !== 'https://earthssaem-lab.vercel.app/' || f.target !== '_blank' || !f.rel.includes('noopener'))
    throw new Error(JSON.stringify(f));
  if (!f.txt.includes(' | ')) throw new Error('구분자 " | " 없음');
});

await step('4장: 박자 없이 마구 두드리면(0.125초 간격) 통과 못 함', async () => {
  await page.evaluate(() => { S.hearts = 99; startChapter(4, true); });
  await waitPlaying4();
  await page.evaluate(() => { window.__mash = setInterval(() => Ch4Scene.pd(0, 0), 125); });
  await page.waitForFunction(() => !Ch4Scene.playing || S.chapter !== 4, null, { timeout: 40000 });
  await page.evaluate(() => clearInterval(window.__mash));
  const r = await page.evaluate(() => ({ hits: Ch4Scene.hits, misses: Ch4Scene.misses, need: TUNING.ch4.needHits }));
  console.log(`   (연타: hits=${r.hits}, misses=${r.misses})`);
  if (r.hits >= r.need) throw new Error('연타로 통과됨 ' + JSON.stringify(r));
});

await step('4장: 하트 0 → 재도전 시 이전 판 "쿵" 예약이 남지 않음', async () => {
  await page.evaluate(() => { S.hearts = 1; startChapter(4, true); });
  await waitPlaying4();
  await page.waitForSelector('#retryBtn', { timeout: 15000 }); // miss 2회 → 하트 0
  const left = await page.evaluate(() => AudioSys.pendingCount());
  if (left !== 0) throw new Error(`재도전 화면 뒤에 예약 소리 ${left}개`);
  await press('retryBtn');
  await page.waitForTimeout(200);
  const r = await page.evaluate(() => {
    const now = AudioSys.now();
    return { times: new Set(AudioSys.sched.filter(s => s.t > now).map(s => s.t.toFixed(4))).size,
             want: TUNING.ch4.countInBeats + TUNING.ch4.totalNotes };
  });
  if (r.times > r.want) throw new Error(`예약 시각 ${r.times}개 > 새 판 ${r.want}개 (이전 판 소리 남음)`);
});

await step('4장: 홈 확인 창 동안 리듬이 멈췄다가 "계속하기"로 이어짐', async () => {
  await page.evaluate(() => { S.hearts = 5; startChapter(4, true); });
  await waitPlaying4();
  const before = await page.evaluate(() => ({ m: Ch4Scene.misses, t: AudioSys.now() }));
  await page.click('#progress');
  await page.waitForSelector('#homeNoBtn', { timeout: 3000 });
  await page.waitForTimeout(2500);
  const mid = await page.evaluate(() => AudioSys.now());
  await press('homeNoBtn');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({ m: Ch4Scene.misses, paused: S.paused }));
  if (mid - before.t > 0.5) throw new Error(`확인 창 동안 리듬 시계가 ${(mid - before.t).toFixed(2)}초 흘렀음`);
  if (after.m - before.m > 1) throw new Error(`확인 창 뒤 miss 급증 ${before.m}→${after.m}`);
  if (after.paused) throw new Error('계속하기 후에도 멈춤');
});

await step('홈: 3장 플레이 중 → 확인 → 처음 화면 (하트·발자국 유지, 이어하기 = 3장)', async () => {
  await page.evaluate(() => { S.hearts = 4; startChapter(3, true); });
  await page.waitForTimeout(300);
  const trailBefore = await page.evaluate(() => Trail.maxUpAlt);
  await page.click('#progress');
  await page.waitForSelector('#homeYesBtn', { timeout: 3000 });
  await press('homeYesBtn');
  await page.waitForSelector('#startBtn', { timeout: 3000 });
  const r = await page.evaluate(() => ({
    screen: S.screen, hearts: S.hearts, trail: Trail.maxUpAlt,
    cont: document.getElementById('contBtn') && document.getElementById('contBtn').textContent,
    mg: document.getElementById('miniGraph').classList.contains('on'),
  }));
  if (r.screen !== 'title' || r.hearts !== 4 || r.trail !== trailBefore) throw new Error(JSON.stringify(r));
  if (!r.cont || !r.cont.includes('3장')) throw new Error('이어하기가 3장이 아님: ' + r.cont);
  if (r.mg) throw new Error('처음 화면에 미니 그래프가 남아 있음');
});

await step('홈: 클리어 직후 처음 화면으로 가도 클리어 대사가 뒤늦게 뜨지 않음', async () => {
  await page.evaluate(() => { startChapter(1, true); Ch1Scene.playing = false; Ch1Scene.clear(); showTitle(); });
  await page.waitForTimeout(900);
  const r = await page.evaluate(() => ({ dlg: S.dialogActive, title: !!document.getElementById('startBtn') }));
  if (r.dlg || !r.title) throw new Error(JSON.stringify(r));
});

await step('대화가 끝나면 뭉게 표정이 그 장의 기본 표정으로 돌아옴', async () => {
  await page.evaluate(() => startChapter(7, false));
  for (let i = 0; i < 40 && await page.evaluate(() => S.dialogActive); i++) { await tapDialog(); await page.waitForTimeout(40); }
  await page.waitForTimeout(200);
  const r = await page.evaluate(() => ({ face: M.face, base: M.baseFace }));
  if (r.face !== r.base) throw new Error(JSON.stringify(r));
});

await step('보너스: γ=8에서 되돌아오면 자유 대류 고도(1.7 km) 안내', async () => {
  await page.evaluate(() => {
    startChapter(8, true);
    Ch8Scene.setGamma(8);
    M.place(M.x, Ch8Scene.map.kmToY(0)); Ch8Scene.h = 0; Ch8Scene.simV = 0; Ch8Scene.settled = true;
    Ch8Scene.poke();
  });
  await page.waitForFunction(() => Ch8Scene.verdict !== '', null, { timeout: 12000 });
  const txt = await page.evaluate(() => document.getElementById('stabRead').textContent);
  if (!txt.includes('1.7 km')) throw new Error(txt);
});

await step('화면 크기가 바뀌어도 고도 유지 (1장 1.0 km / 3장 세계 좌표)', async () => {
  await page.evaluate(() => { S.hearts = 5; startChapter(1, true); M.place(M.x, Ch1Scene.map.kmToY(1.0)); });
  await page.waitForTimeout(300);
  await page.setViewportSize({ width: 1024, height: 560 });
  await page.waitForTimeout(400);
  const h1 = await page.evaluate(() => Ch1Scene.alt());
  await page.setViewportSize({ width: 1024, height: 700 });
  await page.waitForTimeout(300);
  if (Math.abs(h1 - 1.0) > 0.03) throw new Error(`1장 고도 ${h1.toFixed(3)} km`);
  await page.evaluate(() => { startChapter(3, true); const p = Ch3Scene.w2s(1.2, Ch3Scene.bandCenter(1.2)); M.place(p.x, p.y); });
  await page.waitForTimeout(800);
  const a = await page.evaluate(() => Ch3Scene.mWorld());
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.waitForTimeout(300);
  const b = await page.evaluate(() => Ch3Scene.mWorld());
  await page.setViewportSize({ width: 1024, height: 700 });
  if (Math.abs(a.x - b.x) > 0.03 || Math.abs(a.h - b.h) > 0.03) throw new Error(JSON.stringify({ a, b }));
});

await step('세로 화면(회전 안내)일 때 게임 시간 정지', async () => {
  await page.evaluate(() => { startChapter(1, true); });
  await page.setViewportSize({ width: 700, height: 1000 });
  await page.waitForTimeout(200);
  const t0 = await page.evaluate(() => S.time);
  await page.waitForTimeout(800);
  const t1 = await page.evaluate(() => S.time);
  await page.setViewportSize({ width: 1024, height: 700 });
  await page.waitForTimeout(300);
  const t2 = await page.evaluate(() => S.time);
  if (t1 - t0 > 0.05) throw new Error(`세로 화면에서 시간 ${(t1 - t0).toFixed(2)}초 흐름`);
  if (t2 <= t1) throw new Error('가로로 돌아온 뒤 다시 흐르지 않음');
});

// ===================== v1.4 교과서 연계 검증 =====================
await step('계기판: 상대 습도 60% · 불포화 상태 → 4장 정상은 포화(100%)', async () => {
  await page.evaluate(() => { S.hearts = 5; startChapter(0, true); });
  await page.waitForTimeout(200);
  const a = await page.evaluate(() => ({ rh: document.querySelector('#mRH .val').textContent, air: document.getElementById('airState').textContent }));
  if (!a.rh.startsWith('60') || !a.air.includes('불포화')) throw new Error(JSON.stringify(a));
  await page.evaluate(() => startChapter(4, true));
  await page.waitForTimeout(200);
  const b = await page.evaluate(() => ({ rh: document.querySelector('#mRH .val').textContent, air: document.getElementById('airState').textContent }));
  if (!b.rh.startsWith('100') || !b.air.includes('포화 상태')) throw new Error(JSON.stringify(b));
});

await step('1장: 플레이 전에 예측 질문 → 오답 선택 → 클리어 후 여정 지도에 예측 비교 + 교과서 용어 카드', async () => {
  await page.evaluate(() => { S.pred = {}; startChapter(1, false); });
  for (let i = 0; i < 20 && !(await page.evaluate(() => !!document.querySelector('.predOpts .btn'))); i++) {
    await tapDialog(); await page.waitForTimeout(80);
  }
  const playingBefore = await page.evaluate(() => Ch1Scene.playing);
  if (playingBefore) throw new Error('예측 전에 플레이가 시작됨');
  await page.evaluate(() => document.querySelector('.predOpts .btn[data-i="0"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  for (let i = 0; i < 20 && await page.evaluate(() => S.dialogActive); i++) { await tapDialog(); await page.waitForTimeout(60); }
  await page.waitForFunction(() => Ch1Scene.playing, null, { timeout: 5000 });
  await page.evaluate(() => { M.place(M.x, Ch1Scene.map.kmToY(1.0)); });
  await page.waitForFunction(() => !Ch1Scene.playing, null, { timeout: 8000 });
  for (let i = 0; i < 30 && !(await page.evaluate(() => !!document.getElementById('mapNextBtn'))); i++) { await tapDialog(); await page.waitForTimeout(100); }
  const txt = await page.evaluate(() => document.getElementById('overlay').textContent);
  if (!txt.includes('내 예측: 19℃') || !txt.includes('🤔')) throw new Error('예측 비교 없음');
  if (!txt.includes('건조 단열 감률') || !txt.includes('이슬점 감률')) throw new Error('용어 카드 없음');
});

await step('3장: 상승 응결 고도 위에서는 영동 쪽 비탈에 비가 내림', async () => {
  await page.evaluate(() => { startChapter(3, true); const p = Ch3Scene.w2s(1.5, Ch3Scene.bandCenter(1.5)); M.place(p.x, p.y); });
  await page.waitForTimeout(300);
  for (let i = 0; i < 10 && await page.evaluate(() => S.dialogActive); i++) { await tapDialog(); await page.waitForTimeout(60); } // 감률 변화 대사
  await page.evaluate(() => { const p = Ch3Scene.w2s(1.5, Ch3Scene.bandCenter(1.5)); M.place(p.x, p.y); });
  await page.waitForTimeout(500);
  const n = await page.evaluate(() => Ch3Scene.drops.length);
  if (n < 1) throw new Error(`빗방울 ${n}개`);
  await page.evaluate(() => { const p = Ch3Scene.w2s(0.3, 0.75); M.place(p.x, p.y); Ch3Scene.drops = []; Ch3Scene.playing = false; });
  await page.waitForTimeout(400);
  const n2 = await page.evaluate(() => Ch3Scene.drops.length);
  if (n2 > 0) throw new Error(`응결 고도 아래(0.75 km)에서도 비 ${n2}개`);
});

await step('보너스: 층운은 응결 고도(1.0 km) 위에만 그림', async () => {
  await page.evaluate(() => { startChapter(8, true); Ch8Scene.setGamma(4); Ch8Scene.stratus = 1; });
  await page.waitForTimeout(200);
  // 응결 고도선 아래 띠(0.3~0.9 km)에 층운 색(#EDF2F5)이 없어야 함
  const below = await page.evaluate(() => {
    const y0 = Ch8Scene.map.kmToY(0.9), y1 = Ch8Scene.map.kmToY(0.3), x = Math.round(innerWidth * 0.4);
    const d = ctx.getImageData(x * DPR, y0 * DPR, 1, (y1 - y0) * DPR).data;
    let hit = 0; for (let i = 0; i < d.length; i += 4) if (d[i] === 237 && d[i + 1] === 242 && d[i + 2] === 245) hit++;
    return hit;
  });
  if (below > 0) throw new Error(`응결 고도 아래에 층운 픽셀 ${below}`);
});

await step('?ch=5: 처음 화면의 "5장부터 시작" → 앞 장 발자국·지도 라벨 채운 채 5장', async () => {
  const u = new URL('../index.html', import.meta.url); u.search = '?ch=5';
  await page.goto(u.href);
  await page.waitForSelector('#jumpBtn', { timeout: 5000 });
  await press('jumpBtn');
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => ({ ch: S.chapter, up: Trail.maxUpAlt, cond: Trail.condensed, labels: S.mapLabels.length }));
  if (r.ch !== 5 || r.up !== 2 || !r.cond || r.labels !== 5) throw new Error(JSON.stringify(r));
});

if (errors.length) {
  console.log('\n===== JS 오류 =====');
  errors.forEach(e => console.log(' -', e));
}
console.log(failed === 0 && errors.length === 0 ? '\n스모크 테스트 전체 통과 🎉' : `\n실패 ${failed}건 / JS 오류 ${errors.length}건`);
await browser.close();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
