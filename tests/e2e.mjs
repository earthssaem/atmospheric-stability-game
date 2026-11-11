// 본편 전체 진행 테스트 (headless Chromium) — 1부·2부를 실제로 끝까지 진행하며
// 성공 조건(관측·판단), 예상 뒤 피드백, 조작 보조, 기록·엔딩을 확인
// 실행: npm run test:e2e   (사전: npm install — playwright 설치)
// 시스템 크로미움을 쓰려면 CHROMIUM_PATH=/path/to/chrome 환경변수로 지정
import { chromium } from 'playwright';

const errors = [];
const launchOpts = { args: ['--autoplay-policy=no-user-gesture-required'], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) };
const browser = await chromium.launch(launchOpts);
const [VW, VH] = (process.env.VIEWPORT || '1280x800').split('x').map(Number);   // 예: VIEWPORT=1024x768
const page = await browser.newPage({ viewport: { width: VW, height: VH } });
// SHOTS=폴더 를 주면 주요 장면 스크린샷 저장 (검수용)
const shot = async name => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${VW}x${VH}-${name}.png` }); };
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => {
  if (m.type() === 'error' && !m.text().includes('Failed to load resource') && !m.text().includes('net::ERR')) errors.push('console: ' + m.text());
});
const URL0 = new URL('../index.html', import.meta.url).href;
await page.goto(URL0);
await page.waitForTimeout(700);

let failed = 0;
const step = async (name, fn) => {
  try { await fn(); console.log('✅', name); }
  catch (e) { console.log('❌', name, '—', e.message.split('\n')[0]); failed++; }
};
const ev = (fn, arg) => page.evaluate(fn, arg);
const wait = ms => page.waitForTimeout(ms);
const click = async sel => {
  await page.waitForSelector(sel, { timeout: 8000 });
  await ev(s => document.querySelector(s).click(), sel);
  await wait(60);
};
// 대사를 끝까지 (Enter 키로 — 키보드 진행 확인 겸)
const dialogs = async (max = 40) => {
  for (let i = 0; i < max; i++) {
    if (!(await ev(() => S.dialogActive))) return;
    await page.keyboard.press('Enter'); await wait(30);
  }
};
const until = async (fn, ms = 10000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await ev(fn)) return; await wait(60); }
  throw new Error('timeout: ' + fn.toString().slice(0, 80));
};
const overlayText = () => ev(() => document.getElementById('overlay').textContent + ' ' + document.getElementById('actBar').textContent);
const pickOpt = async i => { await page.waitForSelector(`#overlay .opts .btn[data-i="${i}"]`); await click(`#overlay .opts .btn[data-i="${i}"]`); };
const meters = () => ev(() => ({ alt: document.querySelector('#mAlt .val').textContent, T: document.querySelector('#mT .val').textContent, Td: document.querySelector('#mTd .val').textContent, rh: document.querySelector('#mRH .val').textContent }));

/* ===================== 1부 ===================== */
await step('처음 화면: 1부·2부 선택 + 챕터 고르기 + 푸터', async () => {
  await shot('00-title');
  const t = await overlayText();
  for (const k of ['1부 · 산을 건너는 뭉게', '2부 · 놓아주면 어디로 갈까?', '챕터 고르기', '연경쌤의 지구과학 실험실 둘러보기']) if (!t.includes(k)) throw new Error('없음: ' + k);
});

await step('프롤로그: 관측소 메시지 → 버튼으로 짧은 조작 연습 → 출발 기록', async () => {
  await click('#p1Btn');
  await wait(400); await shot('01-station');
  const who = await ev(() => document.getElementById('dName').textContent);
  if (!who.includes('관측소')) throw new Error('첫 메시지가 관측소가 아님: ' + who);
  await dialogs();
  await until(() => document.getElementById('moveBtns').classList.contains('on'));
  await ev(() => document.querySelector('#moveBtns button[data-dx="1"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await until(() => !SeaScene.practice, 6000);
  await ev(() => document.querySelector('#moveBtns button[data-dx="1"]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
  await dialogs();
  await click('#obNext');
  const o = await ev(() => S.rec.obs.find(x => x.id === 'start'));
  if (!o || o.T !== 20 || o.Td !== 12 || Math.round(o.rh) !== 60) throw new Error(JSON.stringify(o));
  await click('#mapNextBtn');
});

await step('첫 관측: 예상(오답) → 키보드 ▲로 0.5 km 정확히 정지 → 계기판 15℃/11℃', async () => {
  await until(() => S.chapter === 1);
  await dialogs();
  await page.waitForSelector('#overlay .opts'); await shot('02-predict');
  await pickOpt(0);                      // 오답 예상 — 감점 없음
  const revealed = await ev(() => S.dialogActive && /1 km에서|같아진다/.test(Dialog.lines[Dialog.idx].text));
  if (revealed) throw new Error('예상 직후 정답을 말함');
  await until(() => RiseScene.playing);
  await page.keyboard.down('ArrowUp');
  await until(() => RiseScene.stopped, 12000);
  await page.keyboard.up('ArrowUp');
  const m = await meters();
  if (!m.alt.startsWith('0.50') || !m.T.startsWith('15.0') || !m.Td.startsWith('11.0')) throw new Error(JSON.stringify(m));
  await shot('03-observe05');
  await click('#obNext');
});
await step('첫 관측: 판단 오답 → 그 선택에 맞는 근거(12℃ → 11℃) → 근거 다시 보기 → 정답', async () => {
  await pickOpt(1);
  await shot('04-judge-wrong');
  const t = await overlayText();
  if (!t.includes('12℃ → 11℃')) throw new Error('구체적 근거 없음: ' + t.slice(0, 120));
  await click('#jgEvi');
  await page.waitForSelector('#overlay svg.bg');
  await click('#evBack');
  await pickOpt(0);
  await click('#jgNext');
  const j = await ev(() => S.rec.judge.j1);
  if (j.firstOk || !j.ok || j.tries !== 2) throw new Error(JSON.stringify(j));
});
await step('첫 관측: 예상 돌아보기 — 고른 답 맞춤 안내 + 관찰로 생각 고치기', async () => {
  await dialogs();
  await page.waitForSelector('#pvRev'); await shot('05-review');
  const t = await overlayText();
  if (!t.includes('두 값이 같은 만큼 내려갈 거라고 예상했구나')) throw new Error(t.slice(0, 140));
  if (!(await ev(() => document.getElementById('pvNext').disabled))) throw new Error('생각 고치기 전 계속 버튼 활성');
  await click('#pvRev'); await click('#pvNext');
  if (!(await ev(() => S.rec.pred.p1.revised))) throw new Error('revised 기록 없음');
  await click('#mapNextBtn');
});

await step('구름이 시작되는 곳: 정답 띠 없이 깃발로 예상 높이 표시(1.2 km)', async () => {
  await until(() => S.chapter === 2);
  await dialogs();
  await page.waitForSelector('#mkOk');
  const flags = await ev(() => RiseScene.cfg.flags.length);
  if (flags) throw new Error('정답 띠/깃발이 미리 보임');
  await click('#mkHint'); await shot('06-mark');
  const hint = await ev(() => document.getElementById('mkHintT').textContent);
  if (!hint.includes('8℃')) throw new Error('힌트 없음');
  await click('#mkOk');
  if (Math.abs((await ev(() => S.rec.marks.lcl)) - 1.2) > 1e-9) throw new Error('표시 높이 기록 안 됨');
});
await step('구름이 시작되는 곳: 1.0 km 미만에서는 물방울 없음, 1.0 km에서 자동 정지 + 물방울(포화)', async () => {
  await until(() => RiseScene.playing);
  await ev(() => { M.held = true; M.ty = RiseScene.map.kmToY(0.9); });
  await until(() => RiseScene.alt() > 0.88, 6000);
  const d0 = await ev(() => ({ h: RiseScene.alt(), drops: M.droplets, coat: M.coat }));
  if (d0.drops !== 0 || d0.coat) throw new Error('불포화인데 물방울: ' + JSON.stringify(d0));
  await ev(() => { M.ty = RiseScene.map.kmToY(1.5); });
  await until(() => RiseScene.stopped, 6000);
  const d1 = await ev(() => ({ h: RiseScene.alt(), drops: M.droplets }));
  if (Math.abs(d1.h - 1.0) > 0.002 || d1.drops !== 1) throw new Error(JSON.stringify(d1));
  const m = await meters();
  if (!m.T.startsWith('10.0') || !m.Td.startsWith('10.0') || !m.rh.startsWith('100')) throw new Error(JSON.stringify(m));
  await shot('07-condense');
  await dialogs();
  const t = await overlayText();
  if (!t.includes('내가 표시한 높이: 1.2 km') || !t.includes('실제로 처음 같아진 높이: 1.0 km')) throw new Error('표시 vs 실제 비교 없음: ' + t.slice(0, 160));
  await click('#obNext');
});
await step('구름이 시작되는 곳: 그래프에서 처음 만나는 점 — 터치 오차 보정(가까운 점으로)', async () => {
  await page.waitForSelector('#overlay svg.bg');
  await click('#overlay .pickList button[data-id="T05"]'); await click('#gpOk');
  if (!(await overlayText()).includes('아직 두 값이 달라')) throw new Error('오답 근거 없음');
  // (10℃, 1.0 km) 점에서 조금 벗어난 곳을 눌러도 그 점이 선택됨
  const box = await ev(() => { const s = document.querySelector('#overlay svg.bg'), c = s.querySelector('circle.cand[data-id="meet"]'); const r = c.getBoundingClientRect(); return { x: r.x + r.width / 2 + 9, y: r.y + r.height / 2 - 8 }; });
  await page.mouse.click(box.x, box.y); await wait(80); await shot('08-graphpick');
  const info = await ev(() => document.querySelector('#overlay .pickInfo').textContent);
  if (!info.includes('10℃ = 이슬점 10℃')) throw new Error('스냅/실제 수치 불일치: ' + info);
  await click('#gpOk'); await click('#gpNext');
  await dialogs();
  await click('#mapNextBtn');
});

await step('정상으로: 예상(10℃/km 그대로) → 바람길 이탈은 감점 없이 복귀 → 정상 2.0 km 정지', async () => {
  await until(() => S.chapter === 3);
  await dialogs();
  await pickOpt(0);
  await until(() => SlopeScene.playing);
  const hearts0 = await ev(() => S.hearts);
  await ev(() => { const p = SlopeScene.w2s(0.6, 1.8); M.held = true; M.tx = p.x; M.ty = p.y; });   // 바람길 위로 크게 벗어남
  await wait(900);
  const off = await ev(() => { const mw = SlopeScene.mWorld(); return Math.abs(mw.h - SlopeScene.bandCenter(mw.x)); });
  if (off > 0.5) throw new Error('바람길로 복귀하지 않음 ' + off);
  if ((await ev(() => S.hearts)) !== hearts0 || (await ev(() => document.getElementById('hearts').classList.contains('on')))) throw new Error('하트가 본편에 사용됨');
  for (let x = 0.8; x <= 3.9; x += 0.25) {
    await ev(x => { const p = SlopeScene.w2s(x, SlopeScene.bandCenter(x)); M.held = true; M.tx = p.x; M.ty = p.y; }, x);
    await wait(260);
    if (await ev(() => !SlopeScene.playing)) break;
  }
  await shot('09-slope');
  await until(() => !SlopeScene.playing, 8000);
  const m = await meters();
  if (!m.alt.startsWith('2.00') || !m.T.startsWith('5.0') || !m.Td.startsWith('5.0')) throw new Error(JSON.stringify(m));
  await click('#obNext');
});
await step('정상으로: 그래프 구간 선택(1~2 km) → 응결열 연결 → 예상 피드백(변화율 비교 안내)', async () => {
  await click('#overlay .pickList button[data-id="s01"]'); await click('#gpOk');
  if (!(await overlayText()).includes('20℃ → 10℃')) throw new Error('오답 근거 없음');
  await click('#overlay .pickList button[data-id="s12"]'); await click('#gpOk'); await click('#gpNext');
  await dialogs();
  const t = await overlayText();
  if (!t.includes('구름이 생기기 전과 같은 변화율을 예상했구나')) throw new Error(t.slice(0, 140));
  await click('#pvEvi'); await page.waitForSelector('#overlay svg.bg'); await click('#evBack');
  await click('#pvRev'); await click('#pvNext');
  await click('#mapNextBtn');
});

await step('구름 속 관찰: 응결 → 강수 → 수분 비교, 판단(수분 감소), 막간 놀이는 선택(바로 본편 복귀)', async () => {
  await until(() => S.chapter === 4);
  await dialogs();
  await pickOpt(1);
  await click('#stNext'); await click('#stNext'); await wait(1500); await shot('10-cloud'); await click('#stNext');
  await pickOpt(2);
  if (!(await overlayText()).includes('물의 합은 그대로')) throw new Error('‘그대로’ 오답 근거 없음');
  await pickOpt(0); await click('#jgNext');
  await dialogs();
  await page.waitForSelector('#pvNext'); await click('#pvNext');
  await page.waitForSelector('#songYes');
  await click('#songYes');
  await until(() => scene === RainSong && document.getElementById('hearts').classList.contains('on'));
  await wait(2500); await shot('11-rainsong');
  await click('#songExit');
  await until(() => scene === CloudScene && !document.getElementById('hearts').classList.contains('on'));
  await click('#mapNextBtn');
});

await step('산 너머로: 예상(20℃) → 하강 중 1 km 자동 정지 → 15℃/7℃ 관찰', async () => {
  await until(() => S.chapter === 5);
  const droplets = await ev(() => M.droplets);
  if (droplets) throw new Error('강수 후 하강하는 뭉게에 물방울이 그려짐');
  await dialogs();
  await pickOpt(0);
  await until(() => DescentScene.playing);
  await ev(() => { const p = DescentScene.w2s(1.6, 0.4); M.held = true; M.tx = p.x; M.ty = p.y; });   // 급하게 끌어도
  await until(() => DescentScene.midDone, 10000);
  const m = await meters();
  if (!m.alt.startsWith('1.00') || !m.T.startsWith('15.0') || !m.Td.startsWith('7.0')) throw new Error(JSON.stringify(m));
  await shot('12-descent-mid');
  await click('#obNext');
  await pickOpt(1);
  if (!(await overlayText()).includes('구름 속을 오를 때')) throw new Error('오답 근거 없음');
  await pickOpt(0); await click('#jgNext');
  await dialogs();
});
await step('산 너머로: 손을 떼도 천천히 영서 평지에 착지(넉넉한 판정) → 25℃/9℃, 예상별 피드백', async () => {
  await until(() => DescentScene.playing);
  await ev(() => { M.held = false; });
  await until(() => DescentScene.landed, 25000);
  const m = await meters();
  if (!m.alt.startsWith('0.00') || !m.T.startsWith('25.0') || !m.Td.startsWith('9.0') || !m.rh.startsWith('36')) throw new Error(JSON.stringify(m));
  await click('#obNext');
  const t = await overlayText();
  if (!t.includes('출발과 같은 기온이 될 거라고 예상했구나')) throw new Error(t.slice(0, 140));
  await click('#pvRev'); await click('#pvNext');
  await dialogs();
  await click('#mapNextBtn');
});

await step('관측소 보고: 빈칸(기온 +5, 이슬점 −3) — 틀리면 출발·도착 값으로 안내', async () => {
  await until(() => S.chapter === 6);
  await dialogs();
  await page.waitForSelector('#rpOk');
  for (let i = 0; i < 4; i++) await click('#aUp');
  for (let i = 0; i < 3; i++) await click('#bUp');
  await click('#rpOk'); await shot('13-report');
  if (!(await overlayText()).includes('출발 20℃ → 도착 25℃')) throw new Error('보고 오답 안내 없음');
  await click('#aUp'); await click('#rpOk');
  await page.waitForSelector('#overlay svg.bg');
});
await step('관측소 보고: 근거 구간 선택(구름 속 상승) → 그림 Ⅲ-13 핵심 빈칸(상대 습도 오답 → 관측값 안내)', async () => {
  await click('#overlay .pickList button[data-id="down"]'); await click('#gpOk');
  if (!(await overlayText()).includes('덜 식은 구간')) throw new Error('오답 근거 없음');
  await click('#overlay .pickList button[data-id="up2"]'); await click('#gpOk'); await click('#gpNext');
  await page.waitForSelector('#overlay .blank');
  await click('#overlay .blank[data-bi="3"]');
  await click('#overlay .opts .btn[data-o="증가"]');
  if (!(await overlayText()).includes('기온은 5℃에서 25℃로, 이슬점은 5℃에서 9℃로')) throw new Error('상대 습도 칸 근거 없음');
  await shot('14-fig13');
  const answers = ['불포화', '−5℃/km', '+10℃/km', '감소'];
  for (let bi = 0; bi < 4; bi++) {
    if (await ev(bi => !document.querySelector(`#overlay .blank[data-bi="${bi}"]`), bi)) continue;
    await click(`#overlay .blank[data-bi="${bi}"]`);
    await click(`#overlay .opts .btn[data-o="${answers[bi]}"]`);
  }
  await click('#f13Done');
  await dialogs();
  await page.waitForSelector('#cpLab');
  await shot('15-checkpoint');
  const t = await overlayText();
  if (!t.includes('1부 정리 지점')) throw new Error('정리 지점 없음');
});

await step('다른 조건의 여행 1단계: 같은 산·다른 이슬점 — 예상 → 두 실험 → 비교 → 이유', async () => {
  await click('#cpLab');
  await until(() => S.chapter === 7);
  await dialogs();
  await pickOpt(0);
  for (let k = 0; k < 2; k++) { await page.waitForSelector('#labGo'); await click('#labGo'); await until(() => LabScene.result && LabScene.u < 0, 8000); await wait(150); }
  const t = await overlayText();
  if (!t.includes('22.5℃') || !t.includes('27.5℃')) throw new Error('비교표 값 오류: ' + t.slice(0, 200));
  await click('#obNext');
  await pickOpt(0); await click('#jgNext');
  await page.waitForSelector('#pvRev'); await click('#pvRev'); await click('#pvNext');
  await dialogs();
});
await step('다른 조건의 여행 2단계: 산 0.8 / 1.0 / 2.5 km — 응결 고도에 못 미침과 정상에서 막 포화를 구별', async () => {
  await pickOpt(1);
  for (let k = 0; k < 3; k++) { await page.waitForSelector('#labGo'); await click('#labGo'); await until(() => LabScene.result && LabScene.u < 0, 8000); await wait(150); }
  await shot('16-lab2');
  const t = await overlayText();
  for (const k of ['응결 고도에 못 미침', '정상에서 막 포화', '27.5℃']) if (!t.includes(k)) throw new Error('없음: ' + k);
  await click('#obNext');
  await pickOpt(1);
  if (!(await overlayText()).includes('도달하지 못한 건 산 0.8 km')) throw new Error('구별 안내 없음');
  await pickOpt(0); await click('#jgNext');
  await page.waitForSelector('#pvNext'); await click('#pvNext');
  await dialogs();
});
await step('다른 조건의 여행 3단계: 목표 30℃ 만들기 (이슬점 16℃ · 산 2.5 km) → 이유 → 자유 실험 → 1부 결과', async () => {
  await page.waitForSelector('#lTd');
  await ev(() => { const a = document.getElementById('lTd'); a.value = 16; a.dispatchEvent(new Event('input')); const b = document.getElementById('lM'); b.value = 2.5; b.dispatchEvent(new Event('input')); });
  for (let i = 0; i < 10; i++) await click('#gUp');
  await click('#labGo');
  await until(() => !!document.querySelector('#overlay .opts'), 8000);
  await pickOpt(0); await click('#jgNext');
  await page.waitForSelector('#labEnd');
  await ev(() => { const a = document.getElementById('lTd'); a.value = 4; a.dispatchEvent(new Event('input')); const b = document.getElementById('lM'); b.value = 1.5; b.dispatchEvent(new Event('input')); });
  // 자유 실험의 예상값은 20℃에서 시작 — 이슬점 4℃ · 산 1.5 km(구름 없음)에서 20℃로 예상
  await click('#labGo'); await until(() => LabScene.result && LabScene.u < 0, 8000); await wait(150);
  if ((await ev(() => S.rec.lab.goodConds.length)) < 2) throw new Error('서로 다른 조건의 예상 기록 안 됨: ' + JSON.stringify(await ev(() => S.rec.lab)));
  const read = await ev(() => document.getElementById('labRead').textContent);
  if (!read.includes('응결 고도에 도달하지 못해')) throw new Error(read);
  await click('#labEnd');
  await page.waitForSelector('#toP2');
});
await step('1부 결과: 처음 예상 · 관측값 · 고른 근거 · 생각 변화 · 다시 보기', async () => {
  await shot('17-results1');
  const t = await overlayText();
  for (const k of ['1부 · 산을 건너는 뭉게 완료', '처음 예상', '관측한 값', '내가 고른 근거', '생각 변화', '관찰 뒤 생각을 고침', '근거를 보고 고침', '다시 보기']) if (!t.includes(k)) throw new Error('없음: ' + k);
});

/* ===================== 2부 ===================== */
const liftAndRelease = async (predIdx) => {
  await until(() => SkyScene.mode === 'lift', 8000);
  await ev(() => document.querySelector('#moveBtns button[data-dy="-1"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await until(() => SkyScene.mode === 'hold', 15000);
  await ev(() => document.querySelector('#moveBtns button[data-dy="-1"]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
  const card = await overlayText(); await shot('18-p2-hold-' + (await ev(() => SkyScene.name + SkyScene.target)));
  await click('#obNext');
  await pickOpt(predIdx);
  await click('#relBtn');
  await wait(1500); await shot('19-p2-release-' + (await ev(() => SkyScene.name + SkyScene.target)));
  await until(() => SkyScene.mode === 'done', 8000);
  return card;
};
await step('2부 전환: 출발 조건(20℃·12℃)으로 돌아옴을 표시, 외부 작용과 놓은 뒤 운동 구별', async () => {
  await click('#toP2');
  await until(() => S.chapter === 8);
  const txt = await ev(() => Dialog.lines.map(l => l.text).join(' '));
  if (!txt.includes('출발할 때의 나(20℃ · 12℃)') || !txt.includes('외부 작용')) throw new Error('전환 안내 부족');
  if ((await ev(() => Dialog.lines.map(l => l.text).join(' '))).includes('안정')) throw new Error('관찰 전에 안정도 이름 공개');
  await dialogs();
});
await step('대기 A(4℃/km): 0.5 km 15℃ vs 18℃ → 놓으면 돌아옴(같은 높이 비교로 판정)', async () => {
  const card = await liftAndRelease(0);
  if (!card.includes('15℃') || !card.includes('18℃')) throw new Error(card);
  const r = await ev(() => ({ out: SkyScene.outcome, h: SkyScene.h }));
  if (r.out !== 'return' || r.h > 0.05) throw new Error(JSON.stringify(r));
  await pickOpt(0); await click('#jgNext');
  await page.waitForSelector('#pvRev'); await click('#pvRev'); await click('#pvNext');
  await click('#noteNext');
});
await step('대기 C(12℃/km): 0.5 km 15℃ vs 14℃ → 계속 올라감', async () => {
  await until(() => S.chapter === 9); await dialogs();
  await liftAndRelease(0);
  const r = await ev(() => ({ out: SkyScene.outcome, h: SkyScene.h }));
  if (r.out !== 'rise' || r.h < 1) throw new Error(JSON.stringify(r));
  await pickOpt(0); await click('#jgNext');
  await page.waitForSelector('#pvNext'); await click('#pvNext');
  await dialogs(); await click('#noteNext');
});
await step('대기 B(8℃/km): 1 km(응결, 10℃ < 12℃) 돌아옴 / 2 km(5℃ > 4℃) 계속 올라감', async () => {
  await until(() => S.chapter === 10); await dialogs();
  await liftAndRelease(2);
  const r1 = await ev(() => ({ out: SkyScene.outcome, drops: riseState(20, 12, 1).saturated }));
  if (r1.out !== 'return' || !r1.drops) throw new Error(JSON.stringify(r1));
  await dialogs();
  await liftAndRelease(0);
  const r2 = await ev(() => ({ out: SkyScene.outcome }));
  if (r2.out !== 'rise') throw new Error(JSON.stringify(r2));
  const t = await ev(() => Dialog.lines.map(l => l.text).join(' '));
  if (!t.includes('구름이 생겼을 때는 아직 주위보다 차가웠어')) throw new Error('비교 대사 없음');
  await dialogs();
});
await step('대기 B: 그래프에서 스스로 오르기 시작하는 높이(약 1.67 km) — 상승 응결 고도와 구별', async () => {
  await page.waitForSelector('#overlay svg.bg');
  await click('#overlay .pickList button[data-id="lcl"]'); await click('#gpOk');
  if (!(await overlayText()).includes('구름이 생기기 시작한 높이')) throw new Error('구별 안내 없음');
  await click('#overlay .pickList button[data-id="lfc"]'); await click('#gpOk');
  if (!(await overlayText()).includes('1.67')) throw new Error('LFC 1.67 표기 없음');
  await shot('20-lfc');
  await click('#gpNext');
  await dialogs();
  for (let i = 0; i < 2; i++) { await page.waitForSelector('#pvNext'); if (await ev(() => !!document.getElementById('pvRev'))) await click('#pvRev'); await click('#pvNext'); }
  await click('#noteNext');
});
await step('이름 붙이기: 관찰 뒤 감률과 연결(오답 시 관찰 근거) → 층운형/적운형', async () => {
  await until(() => S.chapter === 11); await dialogs();
  await page.waitForSelector('#nmOk');
  await click('#overlay [data-n="A"][data-i="2"]'); await click('#overlay [data-n="B"][data-i="1"]'); await click('#overlay [data-n="C"][data-i="0"]');
  await click('#nmOk'); await shot('21-names');
  if (!(await overlayText()).includes('습윤 단열 감률(5)보다 작아')) throw new Error('오답 근거 없음');
  await click('#overlay [data-n="A"][data-i="0"]'); await click('#overlay [data-n="C"][data-i="2"]');
  await click('#nmOk');
  await dialogs();
  await shot('22-clouds');
  await pickOpt(1);
  if (!(await overlayText()).includes('대기 A를 떠올려')) throw new Error('구름 오답 근거 없음');
  await pickOpt(0); await click('#jgNext');
  await dialogs();
});
await step('새로운 하늘(대기 D, 처음 보는 수치): 같은 높이 두 기온으로 판단 → 확인 실험 → 2부 결과', async () => {
  await until(() => S.chapter === 12); await dialogs();
  await page.waitForSelector('#fnOk');
  const t = await overlayText();
  if (!t.includes('16℃') || !t.includes('17℃') || !t.includes('11℃') || !t.includes('8℃')) throw new Error('대기 D 수치 오류');
  await click('#overlay [data-k="0"][data-i="2"]'); await click('#overlay [data-k="1"][data-i="0"]'); await click('#fnOk');
  await dialogs();
  for (let k = 0; k < 2; k++) {
    const n0 = await ev(() => SkyScene.nRel);
    await click('#relBtn');
    await page.waitForFunction(n => SkyScene.nRel > n, n0, { timeout: 9000 });
  }
  const top = await ev(() => ({ h: SkyScene.h, alt: document.querySelector('#mAlt .val').textContent }));
  if (top.h > 3.2) throw new Error('표시 상한을 넘은 고도 ' + JSON.stringify(top));
  const outs = await ev(() => SkyScene.outcome);
  if (outs !== 'rise') throw new Error('2 km 확인 실험 결과 ' + outs);
  await dialogs();
  await page.waitForSelector('#resTitle');
  await shot('23-results2');
  const r = await overlayText();
  if (!r.includes('2부 · 놓아주면 어디로 갈까? 완료') || !r.includes('대기 A')) throw new Error('2부 결과 표시 부족');
});

await step('2부 자유 실험(복습): 감률 5·10 경계 이름, 놓는 높이별 결과를 바로 확인', async () => {
  await click('#toFree');
  await page.waitForSelector('#fsG');
  await ev(() => { const a = document.getElementById('fsG'); a.value = 5; a.dispatchEvent(new Event('input')); });
  if (!(await ev(() => document.getElementById('simPanel').textContent)).includes('포화 공기에 대해 중립')) throw new Error('경계 5 표기 없음');
  await ev(() => { const a = document.getElementById('fsG'); a.value = 12; a.dispatchEvent(new Event('input')); });
  await click('#fsDn'); await click('#fsDn'); await click('#fsDn'); await click('#fsDn'); await click('#fsDn'); await click('#fsDn');  // 0.5 km
  await click('#fsGo');
  const msg = await ev(() => document.getElementById('fsMsg').textContent);
  if (!msg.includes('0.5 km') || !msg.includes('계속 올라가요')) throw new Error(msg);
  await click('#fsEnd');
  await page.waitForSelector('#resTitle');
});

/* ===================== 보조 기능 · 상태 유지 ===================== */
await step('?ch=5: 앞 장은 ‘앞선 여정 요약’(직접 관측과 구별) + 미니 그래프 회색 요약선', async () => {
  const u = new URL(URL0); u.search = '?ch=5';
  await page.goto(u.href); await wait(500);
  await click('#jumpBtn');
  await until(() => S.chapter === 5);
  const r = await ev(() => ({ sum: S.rec.obs.filter(o => o.summary).length, obs: S.rec.obs.filter(o => !o.summary).length, d: document.getElementById('mgSumT').getAttribute('d'), up: document.getElementById('mgUpT').getAttribute('d') }));
  if (r.sum < 5 || r.obs !== 0 || !r.d || r.up) throw new Error(JSON.stringify(r));
});
await step('챕터 고르기 · 홈 확인 창(기록 유지) · 📒 기록에서 대사 다시 읽기', async () => {
  await dialogs();
  await page.waitForSelector('#overlay .opts');
  await pickOpt(2);
  await until(() => DescentScene.playing);
  await page.click('#logBtn');
  await page.waitForSelector('#logClose');
  const t = await overlayText();
  if (!t.includes('앞선 여정 요약') || !t.includes('정상(2 km)이야')) throw new Error('기록/대사 다시 보기 부족');
  await click('#logClose');
  await page.click('#progress');
  await page.waitForSelector('#homeYesBtn');
  await click('#homeYesBtn');
  await page.waitForSelector('#selBtn');
  await click('#selBtn');
  const sel = await overlayText();
  if (!sel.includes('대기 B · 두 높이에서') || !sel.includes('관측소 보고')) throw new Error('챕터 목록 부족');
  await click('#overlay [data-ch="2"]');
  await until(() => S.chapter === 2);
});
await step('화면 크기·세로 회전: 관찰 위치 유지, 세로 화면에서는 시간 정지', async () => {
  await dialogs();
  await page.waitForSelector('#mkOk'); await click('#mkOk');
  await until(() => RiseScene.playing);
  await ev(() => { M.held = true; M.ty = RiseScene.map.kmToY(0.8); });
  await until(() => RiseScene.alt() > 0.78, 6000);
  await ev(() => { M.held = false; M.ty = M.y; });
  await wait(300);
  const h0 = await ev(() => RiseScene.alt());
  await page.setViewportSize({ width: 1024, height: 768 }); await wait(400);
  const h1 = await ev(() => RiseScene.alt());
  if (Math.abs(h1 - h0) > 0.03) throw new Error(`고도 ${h0} → ${h1}`);
  await page.setViewportSize({ width: 800, height: 1280 }); await wait(200);
  const t0 = await ev(() => S.time); await wait(600); const t1 = await ev(() => S.time);
  await page.setViewportSize({ width: 1280, height: 800 }); await wait(300);
  if (t1 - t0 > 0.05) throw new Error('세로 화면에서 시간이 흐름');
});
await step('2부 표시 상한 ≠ 판정: 화면 위로 나가도 판정은 같은 높이 두 기온 비교', async () => {
  await ev(() => { startChapter(9); });
  await dialogs();
  await ev(() => { SkyScene.holdAt(0.5); SkyScene.release(); });
  const out = await ev(() => SkyScene.outcome);
  await until(() => SkyScene.mode === 'done', 8000);
  const r = await ev(() => ({ out: SkyScene.outcome, maxH: SkyScene.maxH }));
  if (out !== 'rise' || r.out !== 'rise') throw new Error(JSON.stringify(r));
});

if (errors.length) { console.log('\n===== JS 오류 ====='); errors.forEach(e => console.log(' -', e)); }
console.log(failed === 0 && errors.length === 0 ? '\n본편 전체 진행 테스트 통과 🎉' : `\n실패 ${failed}건 / JS 오류 ${errors.length}건`);
await browser.close();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
