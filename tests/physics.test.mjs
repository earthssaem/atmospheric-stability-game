// 순수 물리 함수 검증 — index.html 의 PHYSICS 블록을 그대로 추출해 테스트
// 실행: node tests/physics.test.mjs
import { readFileSync } from 'fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const m = html.match(/\/\/ ==PHYSICS-START==([\s\S]*?)\/\/ ==PHYSICS-END==/);
if (!m) { console.error('PHYSICS 블록을 찾을 수 없습니다'); process.exit(1); }

const api = new Function(
  m[1] + '\nreturn { RATE, SCENARIO, lclHeight, riseState, descendFrom, stability, envTemp, lfcHeight, relHumidity, foehnTrip, trailUpPoints, trailDownPoints, pressureAt, volumeRatio, condensedFrac };'
)();

let fails = 0;
function eq(name, got, want, tol = 1e-9) {
  const ok = typeof want === 'number' ? Math.abs(got - want) <= tol : got === want;
  console.log(`${ok ? '✅' : '❌'} ${name}: got=${got} want=${want}`);
  if (!ok) fails++;
}

const { SCENARIO, lclHeight, riseState, descendFrom, stability, envTemp, lfcHeight, relHumidity, foehnTrip, trailUpPoints, trailDownPoints, pressureAt, volumeRatio, condensedFrac } = api;
function eqPts(name, got, want) {
  const ok = got.length === want.length &&
    got.every((p, i) => Math.abs(p[0] - want[i][0]) < 1e-9 && Math.abs(p[1] - want[i][1]) < 1e-9);
  console.log(`${ok ? '✅' : '❌'} ${name}: got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
  if (!ok) fails++;
}

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

// --- 발자국 그래프 경로 (v2) ---
// maxUpAlt=1.5: 기온선 (20,0)→(10,1.0)→(7.5,1.5)로 꺾임, 이슬점선은 (12,0)→(10,1.0) 후 기온선과 합체
const up15 = trailUpPoints(20, 12, 1.5);
eqPts('상승 발자국(1.5km) 기온선', up15.T, [[20, 0], [10, 1], [7.5, 1.5]]);
eqPts('상승 발자국(1.5km) 이슬점선 (합체)', up15.Td, [[12, 0], [10, 1], [7.5, 1.5]]);
// 응결 고도 이전(0.6km): 기울기 10 / 2 로 각각 직선
const up06 = trailUpPoints(20, 12, 0.6);
eqPts('상승 발자국(0.6km) 기온선', up06.T, [[20, 0], [14, 0.6]]);
eqPts('상승 발자국(0.6km) 이슬점선', up06.Td, [[12, 0], [10.8, 0.6]]);
// 하강 발자국: 정상(5,2.0)에서 지표까지 → 기온 25℃, 이슬점 9℃
const dn0 = trailDownPoints(5, 5, 2.0, 0);
eqPts('하강 발자국(→0km) 기온선', dn0.T, [[5, 2], [25, 0]]);
eqPts('하강 발자국(→0km) 이슬점선', dn0.Td, [[5, 2], [9, 0]]);
eqPts('하강 발자국(→0.8km) 기온선', trailDownPoints(5, 5, 2.0, 0.8).T, [[5, 2], [17, 0.8]]);

// --- 7장 조건부 불안정 시나리오 sanity: γ=8일 때 공기 덩어리가 주위보다 따뜻해지는 고도 존재 ---
const cross = riseState(20, 12, 2.0).T > envTemp(20, 8, 2.0);
eq('γ=8, 2.0 km에서 덩어리(5℃) > 주위(4℃) → 상승 지속', cross, true);

// --- 자유 대류 고도(LFC): 응결 고도 위에서 5H/(γ−5) — 7장 도움말의 'N km 위까지 끌어올려 보자' 값 ---
eq('LFC γ=8 (H=1) = 5/3 ≈ 1.67 km', lfcHeight(20, 12, 8), 5 / 3);
eq('LFC γ=10 = 응결 고도 1.0 km', lfcHeight(20, 12, 10), 1.0);
eq('LFC γ=6 = 5.0 km (2 km 안에선 불가)', lfcHeight(20, 12, 6), 5.0);
eq('LFC γ=12 (절대 불안정) = 0 (지표부터)', lfcHeight(20, 12, 12), 0);
eq('LFC γ=4 (절대 안정) = 없음', lfcHeight(20, 12, 4), null);
eq('LFC γ=5 (경계) = 없음', lfcHeight(20, 12, 5), null);
// LFC 바로 위에서는 덩어리가 주위보다 따뜻하고, 바로 아래에서는 차가움
const L8 = lfcHeight(20, 12, 8);
eq('γ=8: LFC+0.01 km에서 덩어리 > 주위', riseState(20, 12, L8 + 0.01).T > envTemp(20, 8, L8 + 0.01), true);
eq('γ=8: LFC−0.01 km에서 덩어리 < 주위', riseState(20, 12, L8 - 0.01).T < envTemp(20, 8, L8 - 0.01), true);

// --- 상대 습도 (그림 Ⅲ-13: 오를 때 증가 → 구름 속 100% 일정 → 내려올 때 감소) ---
eq('상대 습도: 출발 20℃/12℃ ≈ 60%', relHumidity(20, 12), 60.0, 0.5);
eq('상대 습도: 0.5 km 15℃/11℃ ≈ 77% (증가)', relHumidity(15, 11), 77.0, 0.5);
eq('상대 습도: 응결 고도 10℃/10℃ = 100%', relHumidity(10, 10), 100);
eq('상대 습도: 정상 5℃/5℃ = 100% (일정)', relHumidity(5, 5), 100);
eq('상대 습도: 도착 25℃/9℃ ≈ 36% (감소)', relHumidity(25, 9), 36.2, 0.5);

// --- 푄 왕복 (7장 푄 실험실) — 도착 기온 상승 = 5 × (산 높이 − 응결 고도) ---
const f1 = foehnTrip(20, 12, 2.0);
eq('푄(20/12, 산 2 km): 구름 생김', f1.cloud, true);
eq('푄(20/12, 산 2 km): 정상 5℃', f1.topT, 5);
eq('푄(20/12, 산 2 km): 도착 25℃', f1.arrT, 25);
eq('푄(20/12, 산 2 km): 도착 이슬점 9℃', f1.arrTd, 9);
const f2 = foehnTrip(20, 16, 2.5);
eq('푄(20/16, 산 2.5 km): H 0.5 km, 도착 30℃ = 20 + 5×(2.5−0.5)', f2.arrT, 30);
const f3 = foehnTrip(20, 4, 1.5);
eq('푄(20/4, 산 1.5 km): H 2.0 km ≥ 산 → 구름 없음', f3.cloud, false);
eq('푄(20/4, 산 1.5 km): 도착 = 출발 20℃ (푄 없음)', f3.arrT, 20);
eq('푄(20/4, 산 1.5 km): 도착 이슬점 = 출발 4℃', f3.arrTd, 4);
for (const [Td, M] of [[10, 2.0], [14, 3.0], [18, 1.2], [8, 2.6]]) {
  const f = foehnTrip(20, Td, M);
  eq(`푄 일반식 Td=${Td}, 산 ${M} km: ΔT = 5×(M−H)`, f.dT, Math.max(0, 5 * (M - f.H)), 1e-9);
}

// --- 뭉게 크기(모식 표현)의 근거: 부피 비 V/V0 = (T/T0)(p0/p) ---
eq('기압: 지표 1013 hPa', pressureAt(0), 1013);
eq('기압: 높을수록 낮아짐 (1 km < 0 km)', pressureAt(1) < pressureAt(0), true);
eq('부피 비: 출발 상태 = 1', volumeRatio(20, 20, 0), 1);
eq('부피 비: 0.5 km(15℃) ≈ 1.043 (팽창)', volumeRatio(20, 15, 0.5), 1.043, 0.002);
eq('부피 비: 정상 2 km(5℃) ≈ 1.20 (팽창 계속)', volumeRatio(20, 5, 2), 1.204, 0.003);
eq('부피 비: 응결 뒤에도 계속 커짐 (1 km < 2 km)', volumeRatio(20, 10, 1) < volumeRatio(20, 5, 2), true);
eq('부피 비: 하강 1 km(15℃) < 정상 (압축)', volumeRatio(20, 15, 1) < volumeRatio(20, 5, 2), true);
eq('부피 비: 도착 0 km(25℃) ≈ 1.017 (같은 높이, 더 따뜻해서 아주 조금 큼)', volumeRatio(20, 25, 0), 1.017, 0.001);

// --- 응결한 수증기 비율: 포화 전 0, 포화 뒤 증가 ---
eq('응결 비율: 0.5 km(불포화) = 0', condensedFrac(20, 12, 0.5), 0);
eq('응결 비율: 응결 고도 1.0 km = 0 (막 시작)', condensedFrac(20, 12, 1.0), 0);
eq('응결 비율: 1.5 km > 0', condensedFrac(20, 12, 1.5) > 0, true);
eq('응결 비율: 정상 2 km ≈ 0.20', condensedFrac(20, 12, 2.0), 0.20, 0.01);
eq('응결 비율: 높을수록 증가 (1.5 < 2.0)', condensedFrac(20, 12, 1.5) < condensedFrac(20, 12, 2.0), true);

console.log(fails === 0 ? '\n모든 테스트 통과! 🎉' : `\n${fails}개 실패`);
process.exit(fails === 0 ? 0 : 1);
