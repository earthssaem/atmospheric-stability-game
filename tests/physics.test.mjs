// 순수 물리 함수 검증 — index.html 의 PHYSICS 블록을 그대로 추출해 테스트
// 실행: node tests/physics.test.mjs
import { readFileSync } from 'fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const m = html.match(/\/\/ ==PHYSICS-START==([\s\S]*?)\/\/ ==PHYSICS-END==/);
if (!m) { console.error('PHYSICS 블록을 찾을 수 없습니다'); process.exit(1); }

const api = new Function(
  m[1] + '\nreturn { RATE, SCENARIO, lclHeight, riseState, descendFrom, stability, envTemp };'
)();

let fails = 0;
function eq(name, got, want, tol = 1e-9) {
  const ok = typeof want === 'number' ? Math.abs(got - want) <= tol : got === want;
  console.log(`${ok ? '✅' : '❌'} ${name}: got=${got} want=${want}`);
  if (!ok) fails++;
}

const { SCENARIO, lclHeight, riseState, descendFrom, stability, envTemp } = api;

// --- 상승 응결 고도: H = ⅛(T − Td) ---
eq('응결 고도 H = ⅛(20−12) = 1.0 km', lclHeight(SCENARIO.T0, SCENARIO.Td0), 1.0);

// --- 검증 케이스 1: 0.5 km에서 기온 15℃, 이슬점 11℃ (불포화) ---
const s05 = riseState(20, 12, 0.5);
eq('0.5 km 기온 15℃', s05.T, 15);
eq('0.5 km 이슬점 11℃', s05.Td, 11);
eq('0.5 km 불포화', s05.saturated, false);

// --- 검증 케이스 2: 1.0 km에서 기온 = 이슬점 = 10℃ → 응결 ---
const s10 = riseState(20, 12, 1.0);
eq('1.0 km 기온 10℃', s10.T, 10);
eq('1.0 km 이슬점 10℃', s10.Td, 10);
eq('1.0 km 포화(응결)', s10.saturated, true);

// --- 검증 케이스 3: 정상 2.0 km에서 5℃ (습윤 구간 −5℃/km) ---
const s20 = riseState(20, 12, 2.0);
eq('2.0 km(정상) 기온 5℃', s20.T, 5);
eq('2.0 km 이슬점 5℃', s20.Td, 5);

// --- 검증 케이스 4: 하강 후 지표 0 km에서 25℃, 이슬점 9℃ (푄/높새바람) ---
const g = descendFrom(5, 5, 2.0, 0);
eq('영서 지표 기온 25℃ (+10℃/km)', g.T, 25);
eq('영서 지표 이슬점 9℃ (+2℃/km)', g.Td, 9);
eq('하강 중 불포화', g.saturated, false);

// --- 중간 지점 하강 검증: 1.0 km에서 15℃ ---
eq('하강 1.0 km 기온 15℃', descendFrom(5, 5, 2.0, 1.0).T, 15);

// --- 안정도: γ<5 절대 안정 / γ>10 절대 불안정 / 5~10 조건부 ---
eq('γ=4 → 절대 안정', stability(4), 'stable');
eq('γ=5 → 조건부 불안정', stability(5), 'conditional');
eq('γ=8 → 조건부 불안정', stability(8), 'conditional');
eq('γ=10 → 조건부 불안정', stability(10), 'conditional');
eq('γ=12 → 절대 불안정', stability(12), 'unstable');

// --- 환경 기온 ---
eq('γ=8, 1.5 km 환경 기온 8℃', envTemp(20, 8, 1.5), 8);

// --- 7장 조건부 불안정 시나리오 sanity: γ=8일 때 공기 덩어리가 주위보다 따뜻해지는 고도 존재 ---
const cross = riseState(20, 12, 2.0).T > envTemp(20, 8, 2.0);
eq('γ=8, 2.0 km에서 덩어리(5℃) > 주위(4℃) → 상승 지속', cross, true);

console.log(fails === 0 ? '\n모든 테스트 통과! 🎉' : `\n${fails}개 실패`);
process.exit(fails === 0 ? 0 : 1);
