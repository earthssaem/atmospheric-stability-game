// 「모구모구 하늘마을」 순수 물리 함수 검증 — sky-village.html 의 PHYSICS 블록을 추출해 테스트
// 실행: node tests/village.test.mjs
import { readFileSync } from 'fs';

const html = readFileSync(new URL('../sky-village.html', import.meta.url), 'utf8');
const m = html.match(/\/\/ ==PHYSICS-START==([\s\S]*?)\/\/ ==PHYSICS-END==/);
if (!m) { console.error('PHYSICS 블록을 찾을 수 없습니다'); process.exit(1); }

const api = new Function(
  m[1] + '\nreturn { RATE, lclHeight, riseState, riseStateNoLatent, descendFrom, foehn, stability, envTemp, parcelWarmer, cloudForm };'
)();
const { lclHeight, riseState, riseStateNoLatent, descendFrom, foehn, stability, envTemp, parcelWarmer, cloudForm } = api;

let fails = 0;
function eq(name, got, want, tol = 1e-9) {
  const ok = typeof want === 'number' ? Math.abs(got - want) <= tol : got === want;
  console.log(`${ok ? '✅' : '❌'} ${name}: got=${got} want=${want}`);
  if (!ok) fails++;
}

// --- 상승 응결 고도: H = ⅛(T − Td) ---
eq('응결 고도 H = ⅛(20−12) = 1.0 km', lclHeight(20, 12), 1.0);
eq('응결 고도 H = ⅛(20−14) = 0.75 km', lclHeight(20, 14), 0.75);

// --- ascent: 0.5 km에서 T0−5℃ / H에서 기온=이슬점 / H 초과 시 5 ℃/km ---
const s05 = riseState(20, 12, 0.5);
eq('0.5 km 기온 T0−5 = 15℃', s05.T, 15);
eq('0.5 km 이슬점 Td0−1 = 11℃', s05.Td, 11);
eq('0.5 km 불포화', s05.saturated, false);
const sH = riseState(20, 12, 1.0);
eq('H(1.0km)에서 기온 = 이슬점', sH.T, sH.Td);
eq('H에서 포화', sH.saturated, true);
const s20 = riseState(20, 12, 2.0);
eq('H 초과 구간 −5℃/km: 2.0 km에서 5℃', s20.T, 5);
eq('포화 구간 이슬점 = 기온', s20.Td, 5);

// --- 숨은열 OFF 가상 세계: 응결해도 −10℃/km 그대로 ---
eq('OFF 세계 3 km: 20−30 = −10℃', riseStateNoLatent(20, 12, 3).T, -10);
eq('ON 실제 세계 3 km: 0℃', riseState(20, 12, 3).T, 0);
eq('OFF 세계 0.5 km(불포화 구간)는 동일', riseStateNoLatent(20, 12, 0.5).T, 15);

// --- 하강 (불포화): +10℃/km, 이슬점 +2℃/km ---
const g = descendFrom(5, 5, 2.0, 0);
eq('2 km→지표 하강 기온 25℃', g.T, 25);
eq('2 km→지표 하강 이슬점 9℃', g.Td, 9);

// --- 푄: T=20, Td=14, 산 2 km → 도착 26.25℃ ---
const f1 = foehn(20, 14, 2.0);
eq('푄 도착 온도 26.25℃', f1.arriveT, 26.25);
eq('푄 응결 발생', f1.condensed, true);
// H ≥ 산 높이면 도착 = 출발
const f2 = foehn(30, 6, 2.0); // H = 3 ≥ 2
eq('H≥산: 응결 없음', f2.condensed, false);
eq('H≥산: 도착 온도 = 출발 온도', f2.arriveT, 30);
eq('H≥산: 도착 이슬점 = 출발 이슬점', f2.arriveTd, 6);

// --- 안정도 판정: γ<5 안정 / γ>10 불안정 / 5~10 조건부 ---
eq('γ=4 → 절대 안정', stability(4), 'stable');
eq('γ=5 → 조건부 불안정', stability(5), 'conditional');
eq('γ=8 → 조건부 불안정', stability(8), 'conditional');
eq('γ=10 → 조건부 불안정', stability(10), 'conditional');
eq('γ=12 → 절대 불안정', stability(12), 'unstable');

// --- 환경 기온 ---
eq('γ=8, 1.5 km 환경 기온 30−12=18℃', envTemp(30, 8, 1.5), 18);

// --- 부력: γ=8, 지표 30/22 → 0.5 km에서 복귀, 2 km 강제 상승 후 자유 상승 ---
eq('0.5 km: 덩어리(25) < 주위(26) → 복귀', parcelWarmer(30, 22, 8, 0.5), false);
eq('2.0 km: 덩어리(15) > 주위(14) → 자유 상승', parcelWarmer(30, 22, 8, 2.0), true);

// --- 구름 형태: 안정+강제상승·응결 → 층운 / 불안정 → 적운 ---
eq('γ=4, 30/22, 2km 강제 상승 → 층운', cloudForm(30, 22, 4, 2.0), 'stratus');
eq('γ=8(조건부), 30/22, 2km 강제 상승 → 적운', cloudForm(30, 22, 8, 2.0), 'cumulus');
eq('γ=11(불안정), 30/14, 3km → 적운', cloudForm(30, 14, 11, 3.0), 'cumulus');
eq('응결 고도 미달 → 구름 없음', cloudForm(30, 6, 8, 2.0), 'none');

// --- S6 특급 주문 검증: T−Td=16 → H=2, γ=9 이상이면 3km 밀기에서 적운 ---
eq('S6: 30/14 → H = 2.0 km', lclHeight(30, 14), 2.0);
eq('S6: γ=9, 30/14, 3km → 적운', cloudForm(30, 14, 9, 3.0), 'cumulus');
eq('S6: γ=4, 30/14, 3km → 층운', cloudForm(30, 14, 4, 3.0), 'stratus');

console.log(fails === 0 ? '\n모든 테스트 통과! 🎉' : `\n${fails}개 실패`);
process.exit(fails === 0 ? 0 : 1);
