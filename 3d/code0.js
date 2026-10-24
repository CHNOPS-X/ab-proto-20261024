gdjs.MainSceneCode = {};
gdjs.MainSceneCode.localVariables = [];
gdjs.MainSceneCode.idToCallbackMap = new Map();
gdjs.MainSceneCode.GDStageBox3DObjects1= [];
gdjs.MainSceneCode.GDHudPainterObjects1= [];
gdjs.MainSceneCode.GDHudTextObjects1= [];


gdjs.MainSceneCode.userFunc0xa780f0 = function GDJSInlineCode(runtimeScene) {
"use strict";
(function (g) {
  if (g.PJ) return;
  var __defs = {}, __cache = {};
  function __def(id, fn) { __defs[id] = fn; }
  function __req(id) {
    if (__cache[id]) return __cache[id].exports;
    var m = { exports: {} };
    __cache[id] = m;
    __defs[id](m, m.exports, __req);
    return m.exports;
  }
__def("./chart", function (module, exports, require) {
// 〈폴짝! 고무줄〉 T3 비교용 20초 안무 — A안(2D)·B안(3D)이 같은 파일을 읽는다.
// 구조: Codex `비교절차_초안.md` 「공유 안무 제안」(회차 1 합의 8). 고증된 안무 아님 — 비교 실험용.
// 시간 단위: 박(beat). 0박 = 안무 시작. 카운트인 4박은 안무 밖(음수 박)에 둔다.
//
// lane : 'L' 왼발 · 'R' 오른발 · 'J' 점프
// kind : 'tap' (누르기 1회 판정) · 'hold' (걸기 = 누름 판정, 풀기 = 뗌 판정)
// level: 'ankle' 발목 · 'knee' 무릎 · 'high' 높은 줄(골반 기준 제안) — 연출 전용, 판정 무관
// pose : 렌더러용 자세 이름 (판정 무관)

const BPM = 120;
const COUNT_IN_BEATS = 4;
const TOTAL_BEATS = 40; // 20.0초

// 12박 묶음 — 상대 박:
// 0~1 준비·높이 확인 → 2 왼발 걸기 → 4 왼발 풀기 → 5 오른발 걸기
// → 6 오른발 유지 중 왼발 교차 걸기(다리 꼬기) → 7 왼발 풀기 → 8 오른발 풀기 → 9 점프 → 10~11 착지·복귀
function phrase(b, level) {
  return [
    { beat: b + 2, lane: 'L', kind: 'hold', lenBeats: 2, level, pose: 'hook_pull' },
    { beat: b + 5, lane: 'R', kind: 'hold', lenBeats: 3, level, pose: 'hook_pull' },
    { beat: b + 6, lane: 'L', kind: 'hold', lenBeats: 1, level, pose: 'cross_twist' },
    { beat: b + 9, lane: 'J', kind: 'tap', level, pose: 'jump_over' },
  ];
}

// 0~11 발목 · 12~23 무릎 · 24~35 높은 줄 · 36~39 양발 자유 마무리
const NOTES = [...phrase(0, 'ankle'), ...phrase(12, 'knee'), ...phrase(24, 'high')];

// 높이는 묶음 시작 박에 바뀐다. 0~1박 "준비·높이 확인"이 전환을 보여주는 구간이다.
const LEVEL_CHANGES = [
  { beat: 0, level: 'ankle' },
  { beat: 12, level: 'knee' },
  { beat: 24, level: 'high' },
];

function toSeconds(beat, bpm = BPM) {
  return (beat * 60) / bpm;
}

function levelAt(beat) {
  let lv = LEVEL_CHANGES[0].level;
  for (const c of LEVEL_CHANGES) if (beat >= c.beat) lv = c.level;
  return lv;
}

// 판정기가 쓰는 형태로 펼친다: 초 단위 time/endTime, 고유 id.
function buildChart(bpm = BPM) {
  return NOTES.map((n, i) => ({
    id: i,
    lane: n.lane,
    kind: n.kind,
    level: n.level,
    pose: n.pose,
    time: toSeconds(n.beat, bpm),
    endTime: n.kind === 'hold' ? toSeconds(n.beat + n.lenBeats, bpm) : null,
  }));
}

module.exports = { BPM, COUNT_IN_BEATS, TOTAL_BEATS, NOTES, LEVEL_CHANGES, toSeconds, levelAt, buildChart };

});
__def("./judge", function (module, exports, require) {
// 판정기 — 엔진 독립(GDevelop A안·B안 공용). 시간은 전부 곡 시간(초, clock.js 로 변환된 값).
//
// 규칙 (발제 §1.3·§1.4)
// - ±100ms 완벽 / ±200ms 성공. 그 밖은 실패.
// - 입력 하나는 노트 하나에만 대응. 창 안의 가장 이른 미판정 노트 하나를 소비한다.
// - 길게 누르기(hold)는 걸기(누름)·풀기(뗌)를 각각 판정한다.
// - 광고·탭 전환 등 중단 시 유지 상태를 전부 해제한다(interrupt). 카운트인은 호출 측(오디오)이 담당.
//
// inputMode
// - 'hold'   : 일반 화면. 누르고 있는 동안 유지, 떼면 풀기.
// - 'toggle' : 안경 대안(T2). 같은 발을 한 번 더 누르면 풀기. 키를 떼는 동작은 무시.

const DEFAULTS = { perfect: 0.1, good: 0.2, inputMode: 'hold' };
const POINTS = { perfect: 2, good: 1, miss: 0, broken: 0 };

class Judge {
  constructor(chart, opts = {}) {
    this.o = { ...DEFAULTS, ...opts };
    this.notes = chart.map((n) => ({ ...n, start: null, end: null }));
    this.active = {}; // lane → 유지 중인 hold 노트
    this.log = [];
  }

  _grade(diff) {
    const a = Math.abs(diff);
    if (a <= this.o.perfect) return 'perfect';
    if (a <= this.o.good) return 'good';
    return null;
  }

  _emit(ev) {
    this.log.push(ev);
    return ev;
  }

  press(lane, t) {
    if (this.o.inputMode === 'toggle' && this.active[lane]) {
      return this._releaseActive(lane, t);
    }
    if (this.active[lane]) return this._emit({ type: 'ignored', lane, t }); // 이미 유지 중(키 반복 등)

    let pick = null;
    for (const n of this.notes) {
      if (n.lane !== lane || n.start !== null) continue;
      if (Math.abs(t - n.time) > this.o.good) continue;
      if (pick === null || n.time < pick.time) pick = n;
    }
    if (!pick) return this._emit({ type: 'stray', lane, t });

    const g = this._grade(t - pick.time);
    pick.start = g;
    if (pick.kind === 'hold') this.active[lane] = pick;
    return this._emit({ type: pick.kind === 'hold' ? 'hook' : 'tap', id: pick.id, lane, t, grade: g, diff: t - pick.time });
  }

  release(lane, t) {
    if (this.o.inputMode === 'toggle') return null; // 토글 모드에서 키 떼기는 의미 없음
    if (!this.active[lane]) return null;
    return this._releaseActive(lane, t);
  }

  _releaseActive(lane, t) {
    const n = this.active[lane];
    delete this.active[lane];
    const diff = t - n.endTime;
    let g = this._grade(diff);
    if (g === null) g = diff < 0 ? 'broken' : 'miss'; // 너무 일찍 풀면 줄을 놓친 것
    n.end = g;
    return this._emit({ type: 'unhook', id: n.id, lane, t, grade: g, diff });
  }

  // 매 프레임 호출. 지나간 노트를 실패 처리하고, 너무 오래 유지된 hold 를 끊는다.
  tick(t) {
    const out = [];
    for (const n of this.notes) {
      if (n.start === null && t > n.time + this.o.good) {
        n.start = 'miss';
        if (n.kind === 'hold') n.end = 'miss';
        out.push(this._emit({ type: 'miss', id: n.id, lane: n.lane, t }));
      }
    }
    for (const lane of Object.keys(this.active)) {
      const n = this.active[lane];
      if (t > n.endTime + this.o.good) {
        delete this.active[lane];
        n.end = 'miss';
        out.push(this._emit({ type: 'overheld', id: n.id, lane, t }));
      }
    }
    return out;
  }

  // 광고·탭 전환·창 포커스 상실. 유지 중인 hold 를 전부 해제한다.
  // 해제된 풀기 판정은 'interrupted' — 점수 계산에서 제외(플레이어 책임 아님).
  interrupt(t) {
    const out = [];
    for (const lane of Object.keys(this.active)) {
      const n = this.active[lane];
      delete this.active[lane];
      n.end = 'interrupted';
      out.push(this._emit({ type: 'interrupted', id: n.id, lane, t }));
    }
    return out;
  }

  isHolding(lane) {
    return !!this.active[lane];
  }

  score() {
    let pts = 0;
    let max = 0;
    const count = { perfect: 0, good: 0, miss: 0, broken: 0 };
    for (const n of this.notes) {
      for (const k of n.kind === 'hold' ? ['start', 'end'] : ['start']) {
        const g = n[k];
        if (g === 'interrupted') continue;
        max += POINTS.perfect;
        if (g === null) continue; // 아직 판정 전
        pts += POINTS[g];
        count[g] += 1;
      }
    }
    return { pts, max, count };
  }
}

module.exports = { Judge, DEFAULTS, POINTS };

});
__def("./clock", function (module, exports, require) {
// 입력 시각(performance.now 축, ms) → 곡 시간(초, 청자가 들은 위치) 변환.
// 판정은 전부 "청자가 그 순간 듣고 있던 곡 위치" 기준이다.
//
// 두 방식이 있다. 둘을 동시에 쓰면 출력 지연을 이중으로 빼게 된다 — 하나만 고른다.
//
// (a) 'outputTimestamp' — ctx.getOutputTimestamp() 사용.
//     MDN(/en-US/docs/Web/API/AudioContext/getOutputTimestamp) 정의상 contextTime 은
//     "the sample frame currently being rendered by the audio output device"이므로
//     출력 지연이 이미 반영된 위치로 읽힌다. 따라서 outputLatency 를 다시 더하지 않는다.
//     ※ 발제 §1.3("contextTime 에 출력 지연이 포함되지 않는다")과 문구가 어긋난다. T3 리포트에 불일치로 기록.
//
// (b) 'currentTimeMinusLatency' — ctx.currentTime 은 "엔진이 처리 중인" 시각이므로
//     청취 위치 = currentTime − (outputLatency + baseLatency). 발제 §1.3의 "더해야"는 이 방식과 같은 뜻
//     (예약 시각 t 의 소리는 t + 지연 에 들린다).
//
// 브라우저별로 어느 쪽이 실측과 맞는지는 실기 측정 전까지 미확정 — 두 방식을 모두 두고 로그로 비교한다.

function heardContextTime(perfNowMs, src) {
  if (src.mode === 'outputTimestamp') {
    const { contextTime, performanceTime } = src.outputTimestamp;
    return contextTime + (perfNowMs - performanceTime) / 1000;
  }
  if (src.mode === 'currentTimeMinusLatency') {
    // src.currentTime 은 src.sampledAtPerfMs 에 읽은 값
    const latency = (src.outputLatency || 0) + (src.baseLatency || 0);
    return src.currentTime + (perfNowMs - src.sampledAtPerfMs) / 1000 - latency;
  }
  throw new Error('unknown clock mode: ' + src.mode);
}

// songStartCtx: 곡 0박이 예약된 AudioContext 시각(초)
// userOffsetSec: 나중에 설정 메뉴에서만 조정하는 보정값. 첫 실행은 0 (발제 §1.3 — 캘리브레이션 화면 없음)
function songTimeAt(perfNowMs, src, songStartCtx, userOffsetSec = 0) {
  return heardContextTime(perfNowMs, src) - songStartCtx - userOffsetSec;
}

// AudioContext 에서 src 를 만든다. nowMs = performance.now 함수(테스트에서 주입).
// outputTimestamp 는 출력이 시작되기 전 contextTime 0 을 돌려준다 → 그 순간만 currentTime 방식으로 대체.
function sampleClock(ctx, mode, nowMs) {
  if (mode === 'outputTimestamp' && typeof ctx.getOutputTimestamp === 'function') {
    const ts = ctx.getOutputTimestamp();
    if (ts && ts.contextTime > 0) return { mode, outputTimestamp: ts };
  }
  return {
    mode: 'currentTimeMinusLatency',
    currentTime: ctx.currentTime,
    sampledAtPerfMs: nowMs ? nowMs() : performance.now(),
    outputLatency: ctx.outputLatency || 0,
    baseLatency: ctx.baseLatency || 0,
  };
}

module.exports = { heardContextTime, songTimeAt, sampleClock };

});
  g.PJ = { chart: __req('./chart'), judge: __req('./judge'), clock: __req('./clock') };
})(typeof window !== 'undefined' ? window : globalThis);

/**
 * 〈폴짝! 고무줄〉 (Poljjak! Gomujul) — T3 2D(A안) vs 3D(B안) 공유 코어 모듈 (회차 4 최종 통합본)
 * - 판정기·안무·시계 단일 원본: `judge/browser-bundle.js` (`window.PJ = { chart, judge, clock }`)
 * - 선행 오디오 스케줄러: `_scheduleAhead()` (`osc.start(at)`로 카운트인 -4~-1박 및 본곡 0~39박 선행 예약)
 * - 입력 판정 시각: Keyboard 및 Pointer(`pointerdown`/`pointerup`)의 `e.timeStamp` (없으면 `performance.now()`)
 * - 멀티터치: `pointerId`별 독립 활성 레인 추적 (`handlePointerDown` / `handlePointerUp` / `handlePointerCancel`)
 * - 회차 3 합의 반영:
 *   1) 놓친 걸기(`miss`)가 발을 걸린 자세로 만들지 않도록 방어 (`if (ev.type === "miss") return;`)
 *   2) `COUNTIN` 중 `blur` / `visibilitychange` / `popstate` 시에도 일시정지
 *   3) 곡 중(`PLAYING` / `COUNTIN`)에는 `[C]` 시계 전환 금지
 *   4) `window`의 `pointerdown` / `pointerup` / `pointercancel`에서 `e.pointerId`와 `e.timeStamp` 직접 수신
 *   5) `PokiBridge` 초기화(`PokiSDK.init()`) 완료 전 `gameplayStart()` 호출을 큐잉해 `not yet booted` 경고 방지
 */
(function (global) {
  "use strict";

  if (!global.PJ && typeof require === "function") {
    try {
      global.PJ = {
        chart: require("./judge/chart"),
        judge: require("./judge/judge"),
        clock: require("./judge/clock"),
      };
    } catch (_e) {}
  }

  const PJ = global.PJ;
  if (!PJ) throw new Error("PJ(judge 번들)가 먼저 로드돼야 한다");
  const ChartMod = PJ.chart;
  const JudgeMod = PJ.judge;
  const ClockMod = PJ.clock;

  // §1.1 localStorage try/catch 래핑
  const SafeStorage = {
    get(key, fallback) {
      try {
        if (!global.localStorage) return fallback;
        const v = global.localStorage.getItem(key);
        return v !== null ? JSON.parse(v) : fallback;
      } catch (_e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        if (!global.localStorage) return false;
        global.localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (_e) {
        return false;
      }
    },
  };

  // §1.2 Poki SDK 안전 래퍼 (init 완료 전 gameplayStart 호출 방지 + 광고 불변식 준수)
  const PokiBridge = {
    booted: false,
    pendingGameplayStart: false,
    gameplayActive: false,
    adInProgress: false,
    init() {
      if (global.PokiSDK && typeof global.PokiSDK.init === "function") {
        const onBootSettled = () => {
          this.booted = true;
          if (global.PokiSDK && typeof global.PokiSDK.gameLoadingFinished === "function") {
            try {
              global.PokiSDK.gameLoadingFinished();
            } catch (_e) {}
          }
          if (
            this.pendingGameplayStart &&
            this.gameplayActive &&
            !this.adInProgress &&
            global.PokiSDK &&
            typeof global.PokiSDK.gameplayStart === "function"
          ) {
            this.pendingGameplayStart = false;
            try {
              global.PokiSDK.gameplayStart();
            } catch (_e) {}
          }
        };
        try {
          global.PokiSDK.init().then(onBootSettled).catch(onBootSettled);
        } catch (_e) {
          this.booted = true;
        }
      } else {
        this.booted = true;
      }
    },
    gameplayStart() {
      if (this.adInProgress) return;
      if (!this.gameplayActive) {
        this.gameplayActive = true;
        if (!this.booted) {
          this.pendingGameplayStart = true;
          return;
        }
        if (global.PokiSDK && typeof global.PokiSDK.gameplayStart === "function") {
          try {
            global.PokiSDK.gameplayStart();
          } catch (_e) {}
        }
      }
    },
    gameplayStop() {
      this.pendingGameplayStart = false;
      if (this.gameplayActive) {
        this.gameplayActive = false;
        if (this.booted && global.PokiSDK && typeof global.PokiSDK.gameplayStop === "function") {
          try {
            global.PokiSDK.gameplayStop();
          } catch (_e) {}
        }
      }
    },
    commercialBreak(onDone) {
      this.gameplayStop();
      this.adInProgress = true;
      if (this.booted && global.PokiSDK && typeof global.PokiSDK.commercialBreak === "function") {
        try {
          global.PokiSDK.commercialBreak().then(() => {
            this.adInProgress = false;
            if (onDone) onDone();
          });
          return;
        } catch (_e) {}
      }
      this.adInProgress = false;
      if (onDone) onDone();
    },
  };

  const STAGE_BY_LEVEL = { ankle: 1, knee: 2, high: 3 };
  const PITCH_BY_LANE = { L: 523.25, R: 587.33, J: 783.99 };
  const POSE_LABEL = {
    hook_pull: "걸기",
    cross_twist: "교차 꼬기",
    jump_over: "양발 점프",
  };

  function decorateChartNotes(rawChartNotes) {
    return rawChartNotes.map((n) => {
      const stage = STAGE_BY_LEVEL[n.level] || 1;
      const laneKor = n.lane === "L" ? "왼발" : n.lane === "R" ? "오른발" : "양발";
      const poseKor = POSE_LABEL[n.pose] || "동작";
      const pitch = (PITCH_BY_LANE[n.lane] || 659.25) * (1 + (stage - 1) * 0.12);
      return Object.assign({}, n, {
        stage,
        label: stage + "단 " + laneKor + " " + poseKor,
        pitch,
      });
    });
  }

  // Codex 블라인드 정지 장면 분류용 프리셋 6종 (HUD 없이 높이와 줄 상태만 제시)
  const BLIND_SCENES = [
    { id: "B1", stage: 1, heightNorm: 0.18, hookedBy: null, steppedBy: null, lFoot: { x: -0.32, y: -0.25, z: 0 }, rFoot: { x: 0.32, y: -0.25, z: 0 }, desc: "정지장면 1/6 (HUD 숨김)" },
    { id: "B2", stage: 2, heightNorm: 0.46, hookedBy: "LEFT", steppedBy: null, lFoot: { x: -0.44, y: -0.45, z: 0.46 }, rFoot: { x: 0.30, y: -0.22, z: 0 }, desc: "정지장면 2/6 (HUD 숨김)" },
    { id: "B3", stage: 3, heightNorm: 0.78, hookedBy: null, steppedBy: null, lFoot: { x: -0.28, y: 0.18, z: 0.88 }, rFoot: { x: 0.28, y: 0.18, z: 0.88 }, desc: "정지장면 3/6 (HUD 숨김)" },
    { id: "B4", stage: 2, heightNorm: 0.46, hookedBy: "BOTH_TWIST", steppedBy: null, lFoot: { x: 0.26, y: 0.16, z: 0.50 }, rFoot: { x: 0.42, y: -0.44, z: 0.46 }, desc: "정지장면 4/6 (HUD 숨김)" },
    { id: "B5", stage: 1, heightNorm: 0.18, hookedBy: null, steppedBy: "RIGHT", lFoot: { x: -0.30, y: -0.22, z: 0 }, rFoot: { x: 0.18, y: 0.0, z: 0.06 }, desc: "정지장면 5/6 (HUD 숨김)" },
    { id: "B6", stage: 3, heightNorm: 0.78, hookedBy: "RIGHT", steppedBy: null, lFoot: { x: -0.32, y: -0.25, z: 0 }, rFoot: { x: 0.44, y: -0.46, z: 0.78 }, desc: "정지장면 6/6 (HUD 숨김)" },
  ];

  const MELODY_BEATS = [
    392.0, 440.0, 523.25, 523.25, 440.0, 392.0, 329.63, 392.0,
    440.0, 440.0, 392.0, 329.63, 523.25, 587.33, 659.25, 659.25,
    587.33, 523.25, 440.0, 392.0, 523.25, 587.33, 659.25, 523.25,
    659.25, 783.99, 880.0, 880.0, 783.99, 659.25, 587.33, 659.25,
    783.99, 880.0, 987.77, 880.0, 783.99, 880.0, 1046.5, 1046.5,
  ];

  const SCHEDULE_AHEAD_SEC = 0.25;
  const START_LEAD_SEC = 0.08;

  class GomujulSession {
    constructor(modeLabel) {
      this.modeLabel = modeLabel || "2D";
      this.duration = ChartMod.toSeconds(ChartMod.TOTAL_BEATS, ChartMod.BPM);
      this.leadInSec = 2.5; // 5박 예고

      this.glassesMode = false; // [G] 360×640 ↔ 600×600
      this.inputMode = "hold";  // [M] 'hold' ↔ 'toggle'
      const savedClock = SafeStorage.get("orx_gomujul_clock_mode", "outputTimestamp");
      this.clockMode =
        savedClock === "currentTimeMinusLatency" ? "currentTimeMinusLatency" : "outputTimestamp";
      this.autoDemo = false;    // [P]
      this.blindIndex = -1;     // [B] -1이면 일반 모드, 0~5면 블라인드 정지 장면

      this.audioCtx = null;
      this.songStartCtx = 0;
      this.songStartContextTime = 0;
      this.pausedSongTime = 0;
      this.resumeAtSongTime = 0;
      this.nextBeatToSchedule = 0;
      this.scheduledOscs = [];

      this.tapLog = {
        outputTimestamp: [],
        currentTimeMinusLatency: [],
      };
      this.tapClockLog = [];

      this.bestScore = Number(SafeStorage.get("orx_gomujul_best_r2", 0)) || 0;
      this.reset();
      this._bindGlobalEvents();
      PokiBridge.init();
    }

    reset() {
      this._stopScheduledAudio();
      this.state = "READY";
      this.countInRemaining = 0;
      this.songTime = 0;
      this.pausedSongTime = 0;
      this.resumeAtSongTime = 0;
      this.combo = 0;
      this.maxCombo = 0;
      this.counts = { PERFECT: 0, GOOD: 0, MISS: 0, BROKEN: 0 };
      this.lastJudgement = { text: "SPACE / ENTER / 터치로 시작 ([B] 블라인드 정지장면)", kind: "INFO", diffMs: 0 };

      this.chart = decorateChartNotes(ChartMod.buildChart(ChartMod.BPM));
      this.judge = new JudgeMod.Judge(this.chart, { inputMode: this.inputMode });
      this.notes = this._buildFlatNotesView();
      this.autoReleasedIds = {};

      this.stage = 1;
      this.leftFoot = { x: -0.32, y: -0.25, z: 0, targetX: -0.32, targetY: -0.25, targetZ: 0, holding: false, hooked: false, onRope: false };
      this.rightFoot = { x: 0.32, y: -0.25, z: 0, targetX: 0.32, targetY: -0.25, targetZ: 0, holding: false, hooked: false, onRope: false };
      this.rope = {
        stage: 1,
        heightNorm: 0.18,
        pullX: 0,
        pullY: 0,
        pullZ: 0,
        hookedBy: null,
        steppedBy: null,
        vibrationAmp: 0,
        vibrationFreq: 26,
        tension: 0,
      };
      this.jumpTimer = 0;
      this.keyDownState = { L: false, R: false, J: false };
      this.activePointers = {}; // pointerId -> 'L' | 'R' | 'J'
    }

    _buildFlatNotesView() {
      const flat = [];
      for (const jn of this.judge.notes) {
        if (jn.kind === "tap") {
          flat.push({ judgeId: jn.id, type: "tap", lane: jn.lane, time: jn.time, status: "PENDING" });
        } else {
          flat.push({ judgeId: jn.id, type: "hold_start", lane: jn.lane, time: jn.time, status: "PENDING" });
          flat.push({ judgeId: jn.id, type: "hold_end", lane: jn.lane, time: jn.endTime, status: "PENDING" });
        }
      }
      return flat;
    }

    _syncFlatNotesView() {
      for (const item of this.notes) {
        const jn = this.judge.notes[item.judgeId];
        if (!jn) continue;
        if (item.type === "tap" || item.type === "hold_start") {
          item.status = jn.start ? jn.start.toUpperCase() : "PENDING";
        } else if (item.type === "hold_end") {
          item.status = jn.end ? jn.end.toUpperCase() : "PENDING";
        }
      }
    }

    _nowPerfMs() {
      return global.performance && typeof global.performance.now === "function"
        ? global.performance.now()
        : Date.now();
    }

    _ensureAudio() {
      if (!this.audioCtx) {
        const Ctx = global.AudioContext || global.webkitAudioContext;
        if (Ctx) {
          try {
            this.audioCtx = new Ctx();
          } catch (_e) {}
        }
      }
      if (this.audioCtx && this.audioCtx.state === "suspended" && typeof this.audioCtx.resume === "function") {
        try {
          this.audioCtx.resume().catch(() => {});
        } catch (_e) {}
      }
    }

    _sampleClockSafe(mode) {
      if (!this.audioCtx) return null;
      return ClockMod.sampleClock(this.audioCtx, mode, () => this._nowPerfMs());
    }

    getSongTimeAtPerfMs(perfMs) {
      const pMs = typeof perfMs === "number" && perfMs > 0 ? perfMs : this._nowPerfMs();
      if (this.audioCtx && this.audioCtx.state === "running") {
        const src = this._sampleClockSafe(this.clockMode);
        if (src) {
          return ClockMod.songTimeAt(pMs, src, this.songStartCtx, 0);
        }
      }
      return this.songTime;
    }

    getSongTimeNow() {
      return this.getSongTimeAtPerfMs(this._nowPerfMs());
    }

    _scheduleToneAt(freq, startCtxTime, durationSec, type, gainVal) {
      if (!this.audioCtx) return;
      try {
        const at = Math.max(this.audioCtx.currentTime, startCtxTime);
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = type || "triangle";
        osc.frequency.setValueAtTime(freq, at);
        gain.gain.setValueAtTime(gainVal || 0.08, at);
        gain.gain.exponentialRampToValueAtTime(0.001, at + durationSec);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(at);
        osc.stop(at + durationSec);
        this.scheduledOscs.push(osc);
      } catch (_e) {}
    }

    _stopScheduledAudio() {
      if (!this.scheduledOscs || !this.scheduledOscs.length) return;
      for (const osc of this.scheduledOscs) {
        try {
          osc.stop();
        } catch (_e) {}
      }
      this.scheduledOscs = [];
    }

    _scheduleAhead() {
      if (!this.audioCtx || this.audioCtx.state !== "running") return;
      if (this.state !== "COUNTIN" && this.state !== "PLAYING") return;

      const horizon = this.audioCtx.currentTime + SCHEDULE_AHEAD_SEC;
      const resumeBeat = Math.ceil((this.resumeAtSongTime || 0) * 2);

      while (this.nextBeatToSchedule < ChartMod.TOTAL_BEATS) {
        const beatTimeCtx = this.songStartCtx + ChartMod.toSeconds(this.nextBeatToSchedule, ChartMod.BPM);
        if (beatTimeCtx > horizon) break;

        if (this.nextBeatToSchedule < resumeBeat) {
          const isDownbeat = ((this.nextBeatToSchedule % 4) + 4) % 4 === 0;
          this._scheduleToneAt(isDownbeat ? 880.0 : 660.0, beatTimeCtx, 0.08, "sine", 0.08);
        } else {
          const pitch = MELODY_BEATS[this.nextBeatToSchedule] || 523.25;
          this._scheduleToneAt(pitch, beatTimeCtx, 0.2, "triangle", 0.06);
        }
        this.nextBeatToSchedule++;
      }
    }

    startOrResume() {
      this.blindIndex = -1;
      this._ensureAudio();
      const countInBeats = ChartMod.COUNT_IN_BEATS; // 4박
      const countInSec = ChartMod.toSeconds(countInBeats, ChartMod.BPM); // 2.0초

      if (this.state === "READY" || this.state === "FINISHED") {
        this.reset();
        this.state = "COUNTIN";
        this.resumeAtSongTime = 0;
        this.countInRemaining = countInSec;
        const nowCtx = this.audioCtx ? this.audioCtx.currentTime : 0;
        this.songStartCtx = nowCtx + START_LEAD_SEC + countInSec;
        this.songStartContextTime = this.songStartCtx;
        this.nextBeatToSchedule = -countInBeats;
        this._scheduleAhead();
        PokiBridge.gameplayStart();
      } else if (this.state === "PAUSED") {
        this._forceReleaseAllHolds();
        this.state = "COUNTIN";
        this.resumeAtSongTime = this.pausedSongTime;
        this.countInRemaining = countInSec;
        const nowCtx = this.audioCtx ? this.audioCtx.currentTime : 0;
        this.songStartCtx = nowCtx + START_LEAD_SEC + countInSec - this.resumeAtSongTime;
        this.songStartContextTime = this.songStartCtx;
        const resumeBeat = Math.ceil(this.resumeAtSongTime * 2);
        this.nextBeatToSchedule = resumeBeat - countInBeats;
        this._scheduleAhead();
        PokiBridge.gameplayStart();
      }
    }

    pauseGame() {
      if (this.state === "PLAYING" || this.state === "COUNTIN") {
        if (this.state === "COUNTIN") {
          this.songTime = Math.max(0, this.resumeAtSongTime || 0);
        }
        this.pausedSongTime = Math.max(0, this.songTime);
        this._stopScheduledAudio();
        this._forceReleaseAllHolds();
        this.state = "PAUSED";
        PokiBridge.gameplayStop();
      }
    }

    _forceReleaseAllHolds() {
      this.keyDownState = { L: false, R: false, J: false };
      this.activePointers = {};
      const interrupted = this.judge.interrupt(this.songTime);
      if (interrupted && interrupted.length > 0) {
        this._syncFlatNotesView();
      }
      this.leftFoot.holding = false;
      this.leftFoot.hooked = false;
      this.rightFoot.holding = false;
      this.rightFoot.hooked = false;
      this.rope.hookedBy = null;
      this.rope.steppedBy = null;
      this.rope.pullX = 0;
      this.rope.pullY = 0;
      this.rope.pullZ = 0;
      this.rope.tension = 0;
    }

    toggleGlassesMode() {
      this.glassesMode = !this.glassesMode;
      this.inputMode = this.glassesMode ? "toggle" : "hold";
      this.judge.o.inputMode = this.inputMode;
      this._forceReleaseAllHolds();
    }

    toggleInputMode() {
      this.inputMode = this.inputMode === "hold" ? "toggle" : "hold";
      this.judge.o.inputMode = this.inputMode;
      this._forceReleaseAllHolds();
    }

    toggleClockMode() {
      // 곡 진행 중(COUNTIN / PLAYING)에는 시간축 점프를 막기 위해 시계 모드 전환을 금지한다
      if (this.state === "PLAYING" || this.state === "COUNTIN") return;
      this.clockMode = this.clockMode === "outputTimestamp" ? "currentTimeMinusLatency" : "outputTimestamp";
      SafeStorage.set("orx_gomujul_clock_mode", this.clockMode);
      this.lastJudgement = {
        text: "시계 전환: " + this.getClockStatsText(),
        kind: "INFO",
        diffMs: 0,
      };
    }

    getClockStatsText() {
      const arr = this.tapLog[this.clockMode] || [];
      if (!arr.length) return this.clockMode === "outputTimestamp" ? "OT(n=0)" : "CT(n=0)";
      const mean = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
      const prefix = this.clockMode === "outputTimestamp" ? "OT" : "CT";
      return prefix + " 평균 " + (mean >= 0 ? "+" : "") + mean + "ms (n=" + arr.length + ")";
    }

    cycleBlindScene() {
      this.blindIndex = (this.blindIndex + 1) % (BLIND_SCENES.length + 1);
      if (this.blindIndex === BLIND_SCENES.length) {
        this.blindIndex = -1;
        this.reset();
        return;
      }
      const preset = BLIND_SCENES[this.blindIndex];
      this.state = "READY";
      this.stage = preset.stage;
      this.rope.stage = preset.stage;
      this.rope.heightNorm = preset.heightNorm;
      this.rope.hookedBy = preset.hookedBy;
      this.rope.steppedBy = preset.steppedBy;
      this.rope.vibrationAmp = 0;
      this.leftFoot.x = this.leftFoot.targetX = preset.lFoot.x;
      this.leftFoot.y = this.leftFoot.targetY = preset.lFoot.y;
      this.leftFoot.z = this.leftFoot.targetZ = preset.lFoot.z;
      this.leftFoot.hooked = preset.hookedBy === "LEFT" || preset.hookedBy === "L" || preset.hookedBy === "BOTH_TWIST";
      this.rightFoot.x = this.rightFoot.targetX = preset.rFoot.x;
      this.rightFoot.y = this.rightFoot.targetY = preset.rFoot.y;
      this.rightFoot.z = this.rightFoot.targetZ = preset.rFoot.z;
      this.rightFoot.hooked = preset.hookedBy === "RIGHT" || preset.hookedBy === "R" || preset.hookedBy === "BOTH_TWIST";
    }

    _normalizeLane(rawLane) {
      if (rawLane === "LEFT") return "L";
      if (rawLane === "RIGHT") return "R";
      if (rawLane === "JUMP") return "J";
      return rawLane;
    }

    _isLaneHeldByAnyPointer(lane) {
      for (const pid of Object.keys(this.activePointers)) {
        if (this.activePointers[pid] === lane) return true;
      }
      return false;
    }

    /**
     * pointerId별 멀티터치 진입점:
     * 오른발(R)을 누른 채 유지하는 첫 손가락(pointerId 1)과,
     * 6박에 왼발(L)을 교차로 누르는 두 번째 손가락(pointerId 2)을 독립 추적하며,
     * pointerdown/up 이벤트의 e.timeStamp를 그대로 판정 시각으로 전달한다.
     */
    handlePointerDown(pointerId, rawLane, eventPerfMs) {
      const lane = this._normalizeLane(rawLane);
      const pid = String(pointerId !== undefined && pointerId !== null ? pointerId : "mouse");

      if (this.blindIndex >= 0 || this.state !== "PLAYING") {
        // 회차 5: 일시정지 중에는 게임 영역 어디를 눌러도 재개한다(회차 4 는 가운데 J 레인만 재개 — 폰 회귀).
        // 키보드 경로(handleInput)는 그대로: 일시정지 중 A/D 는 재개하지 않고 Space/Enter/Esc 만 재개.
        if (this.state === "PAUSED" && this.blindIndex < 0) {
          this.startOrResume();
          return;
        }
        this.handleInput(lane, true, eventPerfMs);
        return;
      }

      const prevLane = this.activePointers[pid];
      if (prevLane && prevLane !== lane) {
        delete this.activePointers[pid];
        if (this.inputMode === "hold" && !this._isLaneHeldByAnyPointer(prevLane)) {
          this.handleInput(prevLane, false, eventPerfMs);
        }
      }

      const alreadyHeld = this._isLaneHeldByAnyPointer(lane);
      this.activePointers[pid] = lane;

      if (this.inputMode === "toggle" || !alreadyHeld) {
        this.handleInput(lane, true, eventPerfMs);
      }
    }

    handlePointerUp(pointerId, eventPerfMs) {
      const pid = String(pointerId !== undefined && pointerId !== null ? pointerId : "mouse");
      const lane = this.activePointers[pid];
      if (!lane) return;
      delete this.activePointers[pid];

      if (this.state === "PLAYING" && this.inputMode === "hold" && !this._isLaneHeldByAnyPointer(lane)) {
        this.handleInput(lane, false, eventPerfMs);
      }
    }

    handlePointerCancel(pointerId, eventPerfMs) {
      this.handlePointerUp(pointerId, eventPerfMs);
    }

    handleInput(rawLane, isDown, eventPerfMs) {
      const lane = this._normalizeLane(rawLane);

      if (this.blindIndex >= 0) {
        if (isDown) this.cycleBlindScene();
        return;
      }

      if (this.state === "READY" || this.state === "FINISHED") {
        if (isDown) this.startOrResume();
        return;
      }
      if (this.state === "PAUSED") {
        if (isDown && lane === "J") this.startOrResume();
        return;
      }
      if (this.state !== "PLAYING") return;

      const perfMs = typeof eventPerfMs === "number" && eventPerfMs > 0 ? eventPerfMs : this._nowPerfMs();
      const t = this.getSongTimeAtPerfMs(perfMs);

      if (isDown && this.audioCtx && this.audioCtx.state === "running") {
        const srcOut = this._sampleClockSafe("outputTimestamp");
        const srcLat = this._sampleClockSafe("currentTimeMinusLatency");
        if (srcOut && srcLat) {
          const tOut = ClockMod.songTimeAt(perfMs, srcOut, this.songStartCtx, 0);
          const tLat = ClockMod.songTimeAt(perfMs, srcLat, this.songStartCtx, 0);
          this.tapClockLog.push({
            lane,
            tOutMs: Math.round(tOut * 1000),
            tLatMs: Math.round(tLat * 1000),
            diffMs: Math.round((tOut - tLat) * 1000),
          });
        }
      }

      if (isDown) {
        if (this.inputMode === "hold" && this.keyDownState[lane]) return;
        this.keyDownState[lane] = true;
        const ev = this.judge.press(lane, t);
        this._onJudgeEvent(ev, true);
      } else {
        this.keyDownState[lane] = false;
        const ev = this.judge.release(lane, t);
        if (ev) this._onJudgeEvent(ev, true);
      }
    }

    _findChartNote(id) {
      for (const n of this.judge.notes) {
        if (n.id === id) return n;
      }
      return null;
    }

    _onJudgeEvent(ev, fromPlayerInput) {
      if (!ev || ev.type === "ignored" || ev.type === "interrupted") return;
      this._syncFlatNotesView();

      if (ev.type === "stray") {
        this._applyVisualPose(ev.lane, "tap", null);
        return;
      }

      const note = ev.note || this._findChartNote(ev.id);
      const gradeUpper = ev.grade ? ev.grade.toUpperCase() : "MISS";
      const label = note && note.label ? note.label : ev.lane;
      const diffMs = typeof ev.diff === "number" ? Math.round(ev.diff * 1000) : 0;

      if (fromPlayerInput && typeof ev.diff === "number" && this.tapLog[this.clockMode]) {
        this.tapLog[this.clockMode].push(ev.diff * 1000);
      }

      if (ev.grade === "perfect") {
        this.counts.PERFECT++;
        this.combo++;
        if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      } else if (ev.grade === "good") {
        this.counts.GOOD++;
        this.combo++;
        if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      } else if (ev.grade === "broken") {
        this.counts.BROKEN++;
        this.combo = 0;
      } else {
        this.counts.MISS++;
        this.combo = 0;
      }

      this.lastJudgement = {
        text:
          gradeUpper +
          (ev.type === "overheld" ? " 너무 오래 유지" : "") +
          " (" +
          label +
          (ev.type === "unhook" ? " 풀기" : "") +
          ") · " +
          this.getClockStatsText(),
        kind: gradeUpper,
        diffMs,
      };

      // 놓친 걸기(miss)는 발을 걸린 자세로 만들지 않는다(회차 3 합의 결정 3)
      if (ev.type === "miss" || ev.type === "interrupted") return; // 회차 5: interrupted 도 자세를 바꾸지 않는다
      this._applyVisualPose(ev.lane, ev.type === "overheld" ? "unhook" : ev.type, note);
    }

    _applyVisualPose(lane, evType, note) {
      const ropeH = this.rope.heightNorm;
      const pose = note ? note.pose : "step_in";

      if (lane === "J") {
        this.jumpTimer = 0.38;
        this.leftFoot.targetX = -0.25;
        this.leftFoot.targetY = 0.22;
        this.leftFoot.targetZ = ropeH + 0.24;
        this.rightFoot.targetX = 0.25;
        this.rightFoot.targetY = 0.22;
        this.rightFoot.targetZ = ropeH + 0.24;
        this.rope.vibrationAmp = 0.7;
        return;
      }

      const foot = lane === "L" ? this.leftFoot : this.rightFoot;
      const sign = lane === "L" ? -1 : 1;

      if (evType === "unhook" || evType === "overheld") {
        foot.holding = false;
        foot.hooked = false;
        foot.onRope = false;
        foot.targetX = sign * 0.32;
        foot.targetY = -0.25;
        foot.targetZ = 0;
        const otherLane = lane === "L" ? "R" : "L";
        if (this.judge.isHolding(otherLane)) {
          this.rope.hookedBy = otherLane === "L" ? "LEFT" : "RIGHT";
          this.rope.tension = 0.75;
        } else {
          this.rope.hookedBy = null;
          this.rope.steppedBy = null;
          this.rope.pullX = 0;
          this.rope.pullY = 0;
          this.rope.pullZ = 0;
          this.rope.tension = 0;
        }
        this.rope.vibrationAmp = 1.0;
        return;
      }

      if (pose === "cross_twist" || (this.judge.isHolding("L") && this.judge.isHolding("R"))) {
        foot.holding = true;
        foot.hooked = true;
        foot.targetX = -sign * 0.26; // 반대편으로 다리 교차!
        foot.targetY = 0.16;
        foot.targetZ = ropeH + 0.05;
        this.rope.hookedBy = "BOTH_TWIST";
        this.rope.tension = 1.0;
      } else if (evType === "hook" || pose === "hook_pull") {
        foot.holding = true;
        foot.hooked = true;
        foot.targetX = sign * 0.42;
        foot.targetY = -0.44;
        foot.targetZ = ropeH;
        this.rope.hookedBy = lane === "L" ? "LEFT" : "RIGHT";
        this.rope.pullX = foot.targetX;
        this.rope.pullY = foot.targetY;
        this.rope.tension = 0.85;
      } else {
        foot.onRope = true;
        foot.targetX = sign * 0.18;
        foot.targetY = 0.0;
        foot.targetZ = ropeH;
        this.rope.steppedBy = lane === "L" ? "LEFT" : "RIGHT";
        this.rope.vibrationAmp = 0.4;
      }
    }

    update(dt) {
      if (this.blindIndex >= 0) return;
      if (dt > 0.1) dt = 0.1;

      if (this.state === "COUNTIN") {
        this._scheduleAhead();
        if (this.audioCtx && this.audioCtx.state === "running") {
          const measured = this.getSongTimeNow();
          const targetStart = this.resumeAtSongTime || 0;
          this.countInRemaining = Math.max(0, targetStart - measured);
          if (measured >= targetStart) {
            this.songTime = measured;
            this.state = "PLAYING";
            PokiBridge.gameplayStart();
          } else {
            this.songTime = targetStart;
            return;
          }
        } else {
          this.countInRemaining -= dt;
          if (this.countInRemaining <= 0) {
            this.songTime = this.resumeAtSongTime || 0;
            this.state = "PLAYING";
            PokiBridge.gameplayStart();
          } else {
            return;
          }
        }
      }

      if (this.state !== "PLAYING") return;

      if (this.audioCtx && this.audioCtx.state === "running") {
        this._scheduleAhead();
        this.songTime = this.getSongTimeNow();
      } else {
        this.songTime += dt;
      }

      const currentBeat = this.songTime * 2;
      const lv = ChartMod.levelAt(Math.max(0, currentBeat));
      if (lv === "ankle") {
        this.stage = 1;
        this.rope.stage = 1;
        this.rope.heightNorm += (0.18 - this.rope.heightNorm) * Math.min(1, dt * 8);
      } else if (lv === "knee") {
        this.stage = 2;
        this.rope.stage = 2;
        this.rope.heightNorm += (0.46 - this.rope.heightNorm) * Math.min(1, dt * 8);
      } else {
        this.stage = 3;
        this.rope.stage = 3;
        this.rope.heightNorm += (0.78 - this.rope.heightNorm) * Math.min(1, dt * 8);
      }

      // 자동 시연 (Auto Demo)
      if (this.autoDemo) {
        for (const n of this.judge.notes) {
          if (n.start === null && this.songTime >= n.time) {
            const ev = this.judge.press(n.lane, n.time);
            this._onJudgeEvent(ev, false);
          }
          if (n.kind === "hold" && n.start !== null && n.end === null && !this.autoReleasedIds[n.id] && this.songTime >= n.endTime) {
            this.autoReleasedIds[n.id] = true;
            const ev = this.judge._releaseActive(n.lane, n.endTime);
            this._onJudgeEvent(ev, false);
          }
        }
      }

      const missedEvents = this.judge.tick(this.songTime);
      for (const ev of missedEvents) {
        this._onJudgeEvent(ev, false);
      }

      if (this.jumpTimer > 0) {
        this.jumpTimer -= dt;
        if (this.jumpTimer <= 0) {
          this.leftFoot.targetZ = 0;
          this.rightFoot.targetZ = 0;
          this.leftFoot.targetY = -0.22;
          this.rightFoot.targetY = -0.22;
        }
      } else {
        if (!this.judge.isHolding("L") && this.leftFoot.targetZ > 0) {
          this.leftFoot.targetZ = Math.max(0, this.leftFoot.targetZ - dt * 2.2);
        }
        if (!this.judge.isHolding("R") && this.rightFoot.targetZ > 0) {
          this.rightFoot.targetZ = Math.max(0, this.rightFoot.targetZ - dt * 2.2);
        }
      }

      const lerpSpeed = Math.min(1, dt * 16);
      this.leftFoot.x += (this.leftFoot.targetX - this.leftFoot.x) * lerpSpeed;
      this.leftFoot.y += (this.leftFoot.targetY - this.leftFoot.y) * lerpSpeed;
      this.leftFoot.z += (this.leftFoot.targetZ - this.leftFoot.z) * lerpSpeed;

      this.rightFoot.x += (this.rightFoot.targetX - this.rightFoot.x) * lerpSpeed;
      this.rightFoot.y += (this.rightFoot.targetY - this.rightFoot.y) * lerpSpeed;
      this.rightFoot.z += (this.rightFoot.targetZ - this.rightFoot.z) * lerpSpeed;

      if (this.rope.vibrationAmp > 0.005) {
        this.rope.vibrationAmp *= Math.pow(0.04, dt);
      } else {
        this.rope.vibrationAmp = 0;
      }

      if (this.songTime >= this.duration) {
        this.state = "FINISHED";
        this._stopScheduledAudio();
        this._forceReleaseAllHolds();
        const sc = this.judge.score().pts;
        if (sc > this.bestScore) {
          this.bestScore = sc;
          SafeStorage.set("orx_gomujul_best_r2", this.bestScore);
        }
        PokiBridge.commercialBreak(() => {});
      }
    }

    // 회차 5: 포인터 좌표를 "게임 캔버스" 기준으로만 계산한다.
    // 회차 4 는 e.target(이벤트가 난 아무 요소)의 사각형을 썼다 → 캔버스 밖(여백·HTML 요소)을 눌러도 레인·시작·재개로 처리됐다.
    // 캔버스는 화면에서 가장 큰 <canvas> 로 본다(GDevelop 게임 캔버스). 없으면 창 전체를 게임 영역으로 본다(테스트·대체).
    _gameCanvasRect() {
      const doc = global.document;
      if (!doc) return null;
      let best = null;
      let bestArea = 0;
      const list = typeof doc.querySelectorAll === "function" ? doc.querySelectorAll("canvas") : null;
      if (list && list.length) {
        for (let i = 0; i < list.length; i++) {
          const c = list[i];
          if (!c || typeof c.getBoundingClientRect !== "function") continue;
          const r = c.getBoundingClientRect();
          const area = r.width * r.height;
          if (area > bestArea) { best = r; bestArea = area; }
        }
      } else if (typeof doc.querySelector === "function") {
        const c = doc.querySelector("canvas");
        if (c && typeof c.getBoundingClientRect === "function") best = c.getBoundingClientRect();
      }
      return best && best.width > 0 && best.height > 0 ? best : null;
    }

    _resolvePointerCanvasCoords(e) {
      const targetW = this.glassesMode ? 600 : 360;
      const targetH = this.glassesMode ? 600 : 640;
      const clientX = typeof e.clientX === "number" ? e.clientX : NaN;
      const clientY = typeof e.clientY === "number" ? e.clientY : NaN;
      const rect = this._gameCanvasRect() || { left: 0, top: 0, width: global.innerWidth || targetW, height: global.innerHeight || targetH };
      const cx = ((clientX - rect.left) / rect.width) * targetW;
      const cy = ((clientY - rect.top) / rect.height) * targetH;
      const inside = cx >= 0 && cx < targetW && cy >= 0 && cy < targetH; // NaN 이면 false
      return { cx, cy, targetW, targetH, inside };
    }

    _bindGlobalEvents() {
      if (typeof global.addEventListener !== "function") return;

      global.addEventListener("keydown", (e) => {
        if (e.repeat) return;
        const code = e.code;
        const ts = typeof e.timeStamp === "number" ? e.timeStamp : this._nowPerfMs();
        if (code === "Escape") {
          e.preventDefault();
          if (this.state === "PLAYING" || this.state === "COUNTIN") this.pauseGame();
          else if (this.state === "PAUSED") this.startOrResume();
          return;
        }
        if (code === "KeyG") {
          e.preventDefault();
          this.toggleGlassesMode();
          return;
        }
        if (code === "KeyM") {
          e.preventDefault();
          this.toggleInputMode();
          return;
        }
        if (code === "KeyC") {
          e.preventDefault();
          this.toggleClockMode();
          return;
        }
        if (code === "KeyB") {
          e.preventDefault();
          this.cycleBlindScene();
          return;
        }
        if (code === "KeyP") {
          e.preventDefault();
          this.autoDemo = !this.autoDemo;
          if (this.state === "READY") this.startOrResume();
          return;
        }
        if (code === "KeyR") {
          e.preventDefault();
          this.reset();
          this.startOrResume();
          return;
        }

        if (code === "KeyA" || code === "ArrowLeft") {
          e.preventDefault();
          this.handleInput("L", true, ts);
        } else if (code === "KeyD" || code === "ArrowRight") {
          e.preventDefault();
          this.handleInput("R", true, ts);
        } else if (code === "Space" || code === "Enter" || code === "ArrowUp") {
          e.preventDefault();
          this.handleInput("J", true, ts);
        }
      });

      global.addEventListener("keyup", (e) => {
        const code = e.code;
        const ts = typeof e.timeStamp === "number" ? e.timeStamp : this._nowPerfMs();
        if (code === "KeyA" || code === "ArrowLeft") this.handleInput("L", false, ts);
        else if (code === "KeyD" || code === "ArrowRight") this.handleInput("R", false, ts);
        else if (code === "Space" || code === "Enter" || code === "ArrowUp") this.handleInput("J", false, ts);
      });

      // pointerdown / pointerup / pointercancel: e.pointerId 와 e.timeStamp 를 직접 사용해 프레임 양자화 없이 멀티터치 판정
      global.addEventListener("pointerdown", (e) => {
        if (typeof e.button === "number" && e.button !== 0) return;
        const ts = typeof e.timeStamp === "number" ? e.timeStamp : this._nowPerfMs();
        const pid = e.pointerId !== undefined ? e.pointerId : "mouse";
        const { cx, cy, targetW, inside } = this._resolvePointerCanvasCoords(e);
        // 회차 5 우선순위: ① 캔버스 밖 → 무시 ② 상단 UI 바(모든 상태, 일시정지 중 포함) ③ 시작·재개·블라인드 ④ 레인
        if (!inside) return;

        if (cy <= 38) {
          if (cx < targetW * 0.25) {
            this.toggleGlassesMode();
          } else if (cx < targetW * 0.5) {
            this.toggleInputMode();
          } else if (cx < targetW * 0.75) {
            this.toggleClockMode();
          } else {
            this.autoDemo = !this.autoDemo;
            if (this.state === "READY") this.startOrResume();
          }
          return;
        }

        const lane = cx < targetW * 0.35 ? "L" : cx > targetW * 0.65 ? "R" : "J";
        this.handlePointerDown(pid, lane, ts);
      });

      global.addEventListener("pointerup", (e) => {
        const ts = typeof e.timeStamp === "number" ? e.timeStamp : this._nowPerfMs();
        const pid = e.pointerId !== undefined ? e.pointerId : "mouse";
        this.handlePointerUp(pid, ts);
      });

      global.addEventListener("pointercancel", (e) => {
        const ts = typeof e.timeStamp === "number" ? e.timeStamp : this._nowPerfMs();
        const pid = e.pointerId !== undefined ? e.pointerId : "mouse";
        this.handlePointerCancel(pid, ts);
      });

      global.addEventListener("popstate", () => {
        if (this.state === "PLAYING" || this.state === "COUNTIN") this.pauseGame();
      });
      global.addEventListener("blur", () => {
        if (this.state === "PLAYING" || this.state === "COUNTIN") this.pauseGame();
      });
      if (global.document) {
        global.document.addEventListener("visibilitychange", () => {
          if (global.document.hidden && (this.state === "PLAYING" || this.state === "COUNTIN")) {
            this.pauseGame();
          }
        });
      }
    }
  }

  global.ORXGomujul = {
    BPM: ChartMod.BPM,
    NOTES: ChartMod.NOTES,
    BLIND_SCENES,
    buildChart: ChartMod.buildChart,
    Judge: JudgeMod.Judge,
    heardContextTime: ClockMod.heardContextTime,
    songTimeAt: ClockMod.songTimeAt,
    sampleClock: ClockMod.sampleClock,
    GomujulSession,
    SafeStorage,
    PokiBridge,
  };
})(typeof window !== "undefined" ? window : globalThis);


  function createGDNativeDrawer(runtimeScene, painterObjName, textObjName, layerName) {
    let painter = null;
    const existing = runtimeScene.getObjects(painterObjName);
    if (existing && existing.length > 0) {
      painter = existing[0];
    } else {
      painter = runtimeScene.createObject(painterObjName);
    }
    if (painter) {
      painter.setLayer(layerName || "");
      painter.setCoordinatesRelative(false);
      painter.setClearBetweenFrames(true);
      painter.setZOrder(10);
    }

    const textPool = [];
    let textUsed = 0;

    function beginFrame() {
      textUsed = 0;
      if (painter) painter.clear();
    }

    function endFrame() {
      for (let i = textUsed; i < textPool.length; i++) {
        textPool[i].hide(true);
      }
    }

    function rect(x, y, w, h, fillCol, fillAlpha, strokeCol, strokeW, radius) {
      if (!painter) return;
      if (fillCol) {
        painter.setFillColor(fillCol);
        painter.setFillOpacity(fillAlpha !== undefined ? Math.round(fillAlpha * 255) : 255);
      } else {
        painter.setFillOpacity(0);
      }
      if (strokeCol && strokeW > 0) {
        painter.setOutlineColor(strokeCol);
        painter.setOutlineSize(strokeW);
        painter.setOutlineOpacity(255);
      } else {
        painter.setOutlineSize(0);
        painter.setOutlineOpacity(0);
      }
      if (radius && radius > 0) {
        painter.drawRoundedRectangle(x, y, x + w, y + h, radius);
      } else {
        painter.drawRectangle(x, y, x + w, y + h);
      }
    }

    function circle(cx, cy, r, fillCol, fillAlpha, strokeCol, strokeW) {
      if (!painter) return;
      if (fillCol) {
        painter.setFillColor(fillCol);
        painter.setFillOpacity(fillAlpha !== undefined ? Math.round(fillAlpha * 255) : 255);
      } else {
        painter.setFillOpacity(0);
      }
      if (strokeCol && strokeW > 0) {
        painter.setOutlineColor(strokeCol);
        painter.setOutlineSize(strokeW);
        painter.setOutlineOpacity(255);
      } else {
        painter.setOutlineSize(0);
        painter.setOutlineOpacity(0);
      }
      painter.drawCircle(cx, cy, r);
    }

    function ellipse(cx, cy, rx, ry, fillCol, fillAlpha, strokeCol, strokeW) {
      if (!painter) return;
      if (fillCol) {
        painter.setFillColor(fillCol);
        painter.setFillOpacity(fillAlpha !== undefined ? Math.round(fillAlpha * 255) : 255);
      } else {
        painter.setFillOpacity(0);
      }
      if (strokeCol && strokeW > 0) {
        painter.setOutlineColor(strokeCol);
        painter.setOutlineSize(strokeW);
        painter.setOutlineOpacity(255);
      } else {
        painter.setOutlineSize(0);
        painter.setOutlineOpacity(0);
      }
      painter.drawEllipse(cx, cy, rx * 2, ry * 2);
    }

    function line(x1, y1, x2, y2, col, width, alpha, dashed) {
      if (!painter) return;
      painter.setOutlineColor(col || "#FFFFFF");
      painter.setOutlineOpacity(alpha !== undefined ? Math.round(alpha * 255) : 255);
      const w = width || 1;
      if (!dashed) {
        painter.drawLineV2(x1, y1, x2, y2, w);
        return;
      }
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      if (len < 1) return;
      const step = 9;
      const dash = 5;
      const count = Math.floor(len / step);
      for (let i = 0; i <= count; i++) {
        const t0 = (i * step) / len;
        const t1 = Math.min(1, (i * step + dash) / len);
        if (t0 >= 1) break;
        painter.drawLineV2(x1 + dx * t0, y1 + dy * t0, x1 + dx * t1, y1 + dy * t1, w);
      }
    }

    function polyline(pts, col, width, alpha) {
      if (!painter || pts.length < 2) return;
      painter.setOutlineColor(col || "#FFFFFF");
      painter.setOutlineOpacity(alpha !== undefined ? Math.round(alpha * 255) : 255);
      const w = width || 2;
      for (let i = 0; i < pts.length - 1; i++) {
        painter.drawLineV2(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, w);
      }
    }

    function text(str, x, y, size, col, align, bold, zOrder) {
      if (!str && str !== 0) return;
      let tObj = null;
      if (textUsed < textPool.length) {
        tObj = textPool[textUsed];
      } else {
        tObj = runtimeScene.createObject(textObjName);
        if (tObj) {
          tObj.setLayer(layerName || "");
          textPool.push(tObj);
        }
      }
      if (!tObj) return;
      textUsed++;
      tObj.hide(false);
      tObj.setZOrder(zOrder || 40);
      tObj.setCharacterSize(size || 12);
      tObj.setBold(!!bold);
      tObj.setColor(col || "#FFFFFF");
      tObj.setText(String(str));
      const tw = tObj.getWidth();
      const th = tObj.getHeight();
      let tx = x;
      if (align === "center") tx = x - tw * 0.5;
      else if (align === "right") tx = x - tw;
      tObj.setX(tx);
      tObj.setY(y - th * 0.78);
    }

    return { beginFrame, endFrame, rect, circle, ellipse, line, polyline, text };
  }

  function syncGDResolutionAndInput(runtimeScene, session, uiLayerName) {
    const game = runtimeScene.getGame();
    const targetW = session.glassesMode ? 600 : 360;
    const targetH = session.glassesMode ? 600 : 640;
    if (game.getGameResolutionWidth() !== targetW || game.getGameResolutionHeight() !== targetH) {
      game.setAdaptGameResolutionAtRuntime(false);
      game.setGameResolutionSize(targetW, targetH);
    }
    if (uiLayerName !== null) {
      const uiLayer = runtimeScene.getLayer(uiLayerName);
      if (uiLayer) {
        uiLayer.setCameraX(targetW * 0.5, 0);
        uiLayer.setCameraY(targetH * 0.5, 0);
      }
    }

    // GDevelop InputManager의 touchSimulateMouse(false)만 설정하고,
    // 실제 터치·포인터 판정은 shared_choreo_audio.js의 window pointerdown/pointerup/pointercancel
    // (e.pointerId + e.timeStamp 직접 전달) 단일 경로만 사용해 1프레임 양자화 및 이중 호출을 방지함 (회차 3 합의)
    const input = game.getInputManager();
    if (typeof input.touchSimulateMouse === "function") {
      input.touchSimulateMouse(false);
    }

    return { W: targetW, H: targetH };
  }

  function drawCommonHUDNative(d, W, H, session) {
    const glasses = session.glassesMode;

    // 블라인드 정지장면 모드([B])일 때는 HUD·단계 라벨을 숨겨 순수 시각 단서만으로 높이·줄 상태를 판별하게 함 (Codex 관찰 절차)
    if (session.blindIndex >= 0) {
      const preset = window.ORXGomujul.BLIND_SCENES[session.blindIndex];
      d.rect(12, 8, W - 24, 28, "#111111", 0.85, "#00E5FF", 1, 6);
      d.text(
        "[블라인드 관찰 모드] " + preset.desc + " — [B] 또는 터치로 다음 정지장면",
        W * 0.5,
        26,
        11,
        "#00E5FF",
        "center",
        true,
        60
      );
      return;
    }

    // 1. 최상단 컨트롤 토글 바 (0 ~ 36px)
    d.rect(0, 0, W, 36, glasses ? "#111111" : "#263238", 1, "#546E7A", 1, 0);
    const btnLabels = [
      "[G]" + (glasses ? "안경600²" : "일반360"),
      "[M]" + (session.inputMode === "toggle" ? "토글탭" : "홀드"),
      "[C]" + (session.clockMode === "outputTimestamp" ? "OT시계" : "CT시계"),
      "[P]" + (session.autoDemo ? "시연ON" : "수동"),
    ];
    btnLabels.forEach((txt, i) => {
      const bx = (W / 4) * i;
      const bw = W / 4;
      d.rect(bx + 2, 3, bw - 4, 30, null, 0, "#455A64", 1, 4);
      d.text(txt, bx + bw * 0.5, 22, 10, "#ECEFF1", "center", true, 45);
    });

    // 2. 상단 노트 예고 타임라인 (y: 44 ~ 168)
    const laneTop = 44;
    const laneH = 122;
    const hitLineX = 76;
    d.rect(12, laneTop, W - 24, laneH, glasses ? "#00141E" : "#263238", 0.9, glasses ? "#00E5FF" : "#90A4AE", 1.5, 6);

    const trackY = { L: laneTop + 26, J: laneTop + 61, R: laneTop + 96 };
    const trackColors = { L: "#00E5FF", J: "#FFEA00", R: "#FF4081" };
    ["L", "J", "R"].forEach((ln) => {
      const ty = trackY[ln];
      d.line(20, ty, W - 20, ty, "#FFFFFF", 1, 0.2, false);
      d.text(
        ln === "L" ? "왼발(A/←)" : ln === "J" ? "점프(Spc)" : "오른발(D/→)",
        18,
        ty + 4,
        10,
        trackColors[ln],
        "left",
        true,
        45
      );
    });

    // 판정선 (Hit Line)
    d.line(hitLineX, laneTop + 6, hitLineX, laneTop + laneH - 6, "#FFFFFF", 2.5, 1, false);

    // 다가오는 노트 렌더링 (현재 시각 ~ +2.5초 = 5박 예고)
    const pxPerSec = (W - hitLineX - 26) / session.leadInSec;
    for (const n of session.judge.notes) {
      const dtStart = n.time - session.songTime;
      const dtEnd = n.endTime != null ? n.endTime - session.songTime : dtStart;
      if (dtEnd < -0.2 || dtStart > session.leadInSec) continue;
      if (n.start !== null && (n.kind === "tap" || n.end !== null)) continue;

      const nx = Math.max(hitLineX, hitLineX + dtStart * pxPerSec);
      const ny = trackY[n.lane];
      const col = trackColors[n.lane];

      if (n.kind === "hold" && n.endTime != null) {
        const endX = Math.min(W - 18, hitLineX + dtEnd * pxPerSec);
        if (endX > nx) {
          d.rect(nx, ny - 5, Math.max(4, endX - nx), 10, col, 0.35, "#FFFFFF", 1, 3);
          d.rect(endX - 5, ny - 8, 10, 16, "#FFFFFF", 1, "#000000", 1.5, 2);
        }
      }

      if (n.start === null) {
        d.circle(nx, ny, 8, col, 1, "#000000", 2);
        d.text(String(n.stage || 1), nx, ny + 3, 9, "#000000", "center", true, 48);
      }
    }

    // 3. 상태 및 판정 피드백 배너 (y: 174 ~ 210)
    const scObj = session.judge.score();
    const stageKor = session.stage === 1 ? "발목" : session.stage === 2 ? "무릎" : "높은줄";
    d.text(
      session.modeLabel + " | " + session.stage + "단(" + stageKor + ") | " + Math.max(0, session.songTime).toFixed(1) + "/20.0s",
      14,
      188,
      11,
      glasses ? "#FFFFFF" : "#1A2327",
      "left",
      true,
      45
    );
    d.text(
      "점수 " + scObj.pts + "/" + scObj.max + " (콤보 " + session.combo + ")",
      W - 14,
      188,
      11,
      glasses ? "#00E5FF" : "#1A2327",
      "right",
      true,
      45
    );

    const jCol =
      session.lastJudgement.kind === "PERFECT"
        ? glasses ? "#00FF66" : "#00897B"
        : session.lastJudgement.kind === "GOOD"
        ? glasses ? "#FFEA00" : "#E65100"
        : session.lastJudgement.kind === "MISS" || session.lastJudgement.kind === "BROKEN"
        ? "#FF5252"
        : glasses ? "#80D8FF" : "#37474F";
    d.text(session.lastJudgement.text, W * 0.5, 206, 11, jCol, "center", true, 45);

    // 4. 하단 모바일 멀티터치 패드
    const padTop = H - 82;
    const pads = [
      { lane: "L", label: "왼발 (A/←)", sub: session.judge.isHolding("L") ? "줄 걸림 유지중!" : "걸기/교차꼬기", col: "#00ACC1" },
      { lane: "J", label: "점프 (Spc)", sub: "[B]블라인드 정지장면", col: "#FBC02D" },
      { lane: "R", label: "오른발 (D/→)", sub: session.judge.isHolding("R") ? "줄 걸림 유지중!" : "걸기/유지", col: "#D81B60" },
    ];
    pads.forEach((p, idx) => {
      const px = 12 + idx * ((W - 24) / 3);
      const pw = (W - 24) / 3 - 6;
      const isPressed = session.keyDownState[p.lane] || session.judge.isHolding(p.lane);
      d.rect(px, padTop, pw, 68, isPressed ? "#FFFFFF" : glasses ? "#112233" : p.col, 1, p.col, 2, 8);
      d.text(p.label, px + pw * 0.5, padTop + 26, 11, isPressed ? "#000000" : "#FFFFFF", "center", true, 46);
      d.text(p.sub, px + pw * 0.5, padTop + 46, 9, isPressed ? "#000000" : "#ECEFF1", "center", false, 46);
    });

    // 5. 일시정지 / 카운트인 / 결과 모달
    if (session.state !== "PLAYING") {
      const my = H * 0.36;
      d.rect(20, my, W - 40, 146, "#000000", 0.82, "#00E5FF", 2, 8);
      if (session.state === "READY") {
        d.text("〈폴짝! 고무줄〉 " + session.modeLabel, W * 0.5, my + 34, 14, "#FFFFFF", "center", true, 55);
        d.text("Space / Enter / 화면 터치로 20초 안무 시작", W * 0.5, my + 62, 11, "#80D8FF", "center", true, 55);
        d.text("[G] 600×600 안경 | [M] 홀드/토글 | [C] 시계전환", W * 0.5, my + 88, 10, "#ECEFF1", "center", false, 55);
        d.text("[B] 블라인드 정지장면 6종 | [P] 자동시연", W * 0.5, my + 112, 10, "#FFEA00", "center", false, 55);
      } else if (session.state === "COUNTIN") {
        d.text(
          "준비 카운트인: " + Math.max(1, Math.ceil(session.countInRemaining * 2)) + "박...",
          W * 0.5,
          my + 76,
          16,
          "#FFEA00",
          "center",
          true,
          55
        );
      } else if (session.state === "PAUSED") {
        d.text("일시정지됨 (홀드 강제 해제·점수 제외)", W * 0.5, my + 55, 14, "#FFFFFF", "center", true, 55);
        d.text("Space / Enter / 터치로 4박 카운트인 후 재개", W * 0.5, my + 92, 11, "#80D8FF", "center", false, 55);
      } else if (session.state === "FINISHED") {
        d.text(
          "20초 안무 완료! 점수: " + scObj.pts + " / " + scObj.max,
          W * 0.5,
          my + 36,
          14,
          "#00FF66",
          "center",
          true,
          55
        );
        d.text(
          "PERFECT " + scObj.count.perfect + " | GOOD " + scObj.count.good + " | MISS " + scObj.count.miss + " | BROKEN " + scObj.count.broken,
          W * 0.5,
          my + 66,
          10,
          "#FFFFFF",
          "center",
          false,
          55
        );
        d.text(
          "시계 측정: " + session.getClockStatsText(),
          W * 0.5,
          my + 92,
          10,
          "#80D8FF",
          "center",
          false,
          55
        );
        d.text(
          "최고 점수: " + session.bestScore + " (Space/터치로 재시작)",
          W * 0.5,
          my + 118,
          11,
          "#FFEA00",
          "center",
          true,
          55
        );
      }
    }
  }


(function(runtimeScene) {
  function placeBox3D(box, cx, cy, cz, w, h, d, colorStr, rotX, rotY, rotZ) {
    box.hide(false);
    box.setWidth(w);
    box.setHeight(h);
    box.setDepth(d);
    box.setX(cx - w * 0.5);
    box.setY(cy - h * 0.5);
    box.setZ(cz - d * 0.5);
    if (colorStr) box.setColor(colorStr);
    box.setRotationX(rotX || 0);
    box.setRotationY(rotY || 0);
    box.setAngle(rotZ || 0);
  }

  // 두 3D 점 p1(x,y,z) ~ p2(x,y,z) 사이를 잇는 3D 각기둥(StageBox3D) 배치
  function placeBeam3D(box, p1, p2, thick, colorStr) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = p2.z - p1.z;
    const len = Math.max(1, Math.hypot(dx, dy, dz));
    const horiz = Math.hypot(dx, dy);
    const angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
    const rotYDeg = -Math.atan2(dz, horiz) * (180 / Math.PI);
    placeBox3D(
      box,
      (p1.x + p2.x) * 0.5,
      (p1.y + p2.y) * 0.5,
      (p1.z + p2.z) * 0.5,
      len,
      thick,
      thick,
      colorStr,
      0,
      rotYDeg,
      angleDeg
    );
  }

  if (!runtimeScene.__orx3DState) {
    const session = new window.ORXGomujul.GomujulSession("B안: GDevelop 3D");
    window.__orxSession = session;
    const drawer = createGDNativeDrawer(runtimeScene, "HudPainter", "HudText", "UI");

    const spawnBox = () => {
      const b = runtimeScene.createObject("StageBox3D");
      b.setLayer("");
      b.setMaterialType("Basic");
      return b;
    };

    // 초기 씬에 있던 템플릿 StageBox3D 숨김 처리
    const initBoxes = runtimeScene.getObjects("StageBox3D");
    for (let i = 0; i < initBoxes.length; i++) {
      initBoxes[i].hide(true);
    }

    const groundBox = spawnBox();
    const gridBoxes = [];
    for (let i = 0; i < 10; i++) gridBoxes.push(spawnBox());

    const leftPillar = spawnBox();
    const rightPillar = spawnBox();
    const stageMarkers = [];
    for (let i = 0; i < 6; i++) stageMarkers.push(spawnBox());

    const hipBox = spawnBox();
    const leftThigh = spawnBox();
    const leftCalf = spawnBox();
    const rightThigh = spawnBox();
    const rightCalf = spawnBox();
    const leftFootBox = spawnBox();
    const rightFootBox = spawnBox();
    const leftShadowBox = spawnBox();
    const rightShadowBox = spawnBox();

    const ROPE_SEGMENTS = 14;
    const ropeBoxes = [];
    for (let i = 0; i < ROPE_SEGMENTS; i++) ropeBoxes.push(spawnBox());

    runtimeScene.__orx3DState = {
      session,
      drawer,
      groundBox,
      gridBoxes,
      leftPillar,
      rightPillar,
      stageMarkers,
      hipBox,
      leftThigh,
      leftCalf,
      rightThigh,
      rightCalf,
      leftFootBox,
      rightFootBox,
      leftShadowBox,
      rightShadowBox,
      ropeBoxes,
    };
  }

  const st = runtimeScene.__orx3DState;
  const session = st.session;
  const d = st.drawer;
  const dt = runtimeScene.getElapsedTime() / 1000;
  session.update(dt);

  const { W, H } = syncGDResolutionAndInput(runtimeScene, session, "UI");
  const glasses = session.glassesMode;

  // 배경색 설정 (일반: 짙은 슬레이트 / 안경: #000000 순검정)
  runtimeScene.setBackgroundColor(glasses ? 0 : 38, glasses ? 0 : 50, glasses ? 0 : 56);

  // 3D 무대 중심 좌표 (GDevelop 3D 월드 픽셀 단위)
  const cx = W * 0.5;
  const cy = 370;
  const spanX = 128; // 좌우 기둥 반폭

  // GDevelop 내장 3D 카메라 설정 (gdjs.scene3d.camera API)
  const baseLayer = runtimeScene.getLayer("");
  baseLayer.setCameraX(cx, 0);
  baseLayer.setCameraY(cy + 250, 0);
  gdjs.scene3d.camera.setCameraZ(runtimeScene, 195, "", 0);
  gdjs.scene3d.camera.setFov(runtimeScene, 42, "", 0);
  gdjs.scene3d.camera.turnCameraTowardPosition(runtimeScene, cx, cy - 15, 58, "", 0, false);

  // 1. 3D 지면 및 격자 배치
  if (glasses) {
    st.groundBox.hide(true);
  } else {
    placeBox3D(st.groundBox, cx, cy, -3, 300, 220, 6, "216;197;172", 0, 0, 0);
  }
  const gridCol = glasses ? "34;68;85" : "166;144;118";
  for (let i = 0; i < 5; i++) {
    const gx = cx + (i - 2) * 60;
    placeBox3D(st.gridBoxes[i], gx, cy, 0.5, 2, 200, 1.5, gridCol, 0, 0, 0);
    const gy = cy + (i - 2) * 44;
    placeBox3D(st.gridBoxes[i + 5], cx, gy, 0.5, 280, 2, 1.5, gridCol, 0, 0, 0);
  }

  // 2. 좌우 3D 기둥 및 1·2·3단 높이 마커 배치
  const pillarCol = glasses ? "220;230;240" : "93;64;55";
  placeBox3D(st.leftPillar, cx - spanX, cy, 72, 10, 10, 144, pillarCol, 0, 0, 0);
  placeBox3D(st.rightPillar, cx + spanX, cy, 72, 10, 10, 144, pillarCol, 0, 0, 0);

  const stageZ3D = { 1: 22, 2: 56, 3: 96 };
  const markerCols = { 1: "105;240;174", 2: "255;215;64", 3: "255;82;82" };
  [1, 2, 3].forEach((sIdx, idx) => {
    const mz = stageZ3D[sIdx];
    const mCol = session.stage === sIdx ? "255;255;0" : markerCols[sIdx];
    const mw = session.stage === sIdx ? 18 : 14;
    placeBox3D(st.stageMarkers[idx * 2], cx - spanX, cy, mz, mw, mw, 5, mCol, 0, 0, 0);
    placeBox3D(st.stageMarkers[idx * 2 + 1], cx + spanX, cy, mz, mw, mw, 5, mCol, 0, 0, 0);
  });

  // 3. 3D 캐릭터 다리·발·그림자 배치 (StageBox3D)
  const ropeZ = session.rope.heightNorm * 122;
  const lPos = {
    x: cx + session.leftFoot.x * 115,
    y: cy - session.leftFoot.y * 85,
    z: session.leftFoot.z * 122 + 7,
  };
  const rPos = {
    x: cx + session.rightFoot.x * 115,
    y: cy - session.rightFoot.y * 85,
    z: session.rightFoot.z * 122 + 7,
  };

  placeBox3D(st.leftFootBox, lPos.x, lPos.y, lPos.z, 24, 36, 14, "0;229;255", 0, 0, 0);
  placeBox3D(st.rightFootBox, rPos.x, rPos.y, rPos.z, 24, 36, 14, "255;64;129", 0, 0, 0);

  const shadowCol3D = glasses ? "0;110;140" : "60;50;45";
  placeBox3D(st.leftShadowBox, lPos.x, lPos.y, 1, 22, 26, 2, shadowCol3D, 0, 0, 0);
  placeBox3D(st.rightShadowBox, rPos.x, rPos.y, 1, 22, 26, 2, shadowCol3D, 0, 0, 0);

  const hipPos = { x: cx, y: cy + 16, z: 96 + Math.max(lPos.z, rPos.z) * 0.22 };
  placeBox3D(st.hipBox, hipPos.x, hipPos.y, hipPos.z, 56, 26, 28, "69;90;100", 0, 0, 0);

  const lKnee = {
    x: (hipPos.x - 16 + lPos.x) * 0.5 - (session.stage * 5),
    y: (hipPos.y + lPos.y) * 0.5 - 10,
    z: (hipPos.z + lPos.z) * 0.5 + 8,
  };
  const rKnee = {
    x: (hipPos.x + 16 + rPos.x) * 0.5 + (session.stage * 5),
    y: (hipPos.y + rPos.y) * 0.5 - 10,
    z: (hipPos.z + rPos.z) * 0.5 + 8,
  };
  placeBeam3D(st.leftThigh, { x: hipPos.x - 16, y: hipPos.y, z: hipPos.z }, lKnee, 10, "0;184;212");
  placeBeam3D(st.leftCalf, lKnee, lPos, 9, "0;229;255");
  placeBeam3D(st.rightThigh, { x: hipPos.x + 16, y: hipPos.y, z: hipPos.z }, rKnee, 10, "216;27;96");
  placeBeam3D(st.rightCalf, rKnee, rPos, 9, "255;64;129");

  // 4. 3D 고무줄 세그먼트 체인 배치 (StageBox3D 14개)
  const pLeft = { x: cx - spanX, y: cy, z: ropeZ };
  const pRight = { x: cx + spanX, y: cy, z: ropeZ };
  const vib =
    session.rope.vibrationAmp > 0
      ? Math.sin(session.songTime * session.rope.vibrationFreq * Math.PI * 2) * session.rope.vibrationAmp * 18
      : 0;

  const knots = [pLeft];
  const hb = session.rope.hookedBy;
  const sb = session.rope.steppedBy;
  if (hb === "BOTH_TWIST") {
    knots.push(lPos, rPos);
  } else if (hb === "L" || hb === "LEFT" || sb === "L" || sb === "LEFT") {
    knots.push(lPos);
  } else if (hb === "R" || hb === "RIGHT" || sb === "R" || sb === "RIGHT") {
    knots.push(rPos);
  }
  knots.push(pRight);

  const ropeCol3D =
    session.rope.tension > 0.8
      ? "255;255;255"
      : session.stage === 1
      ? "105;240;174"
      : session.stage === 2
      ? "255;215;64"
      : "255;82;82";

  const lerp3 = (a, b, t) => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  });

  const N = st.ropeBoxes.length;
  for (let i = 0; i < N; i++) {
    const t0 = i / N;
    const t1 = (i + 1) / N;
    const samplePt = (t) => {
      if (knots.length === 2) {
        const p = lerp3(knots[0], knots[1], t);
        p.z += Math.sin(t * Math.PI) * vib;
        return p;
      } else if (knots.length === 3) {
        return t < 0.5 ? lerp3(knots[0], knots[1], t * 2) : lerp3(knots[1], knots[2], (t - 0.5) * 2);
      } else {
        if (t < 1 / 3) return lerp3(knots[0], knots[1], t * 3);
        if (t < 2 / 3) return lerp3(knots[1], knots[2], (t - 1 / 3) * 3);
        return lerp3(knots[2], knots[3], (t - 2 / 3) * 3);
      }
    };
    placeBeam3D(st.ropeBoxes[i], samplePt(t0), samplePt(t1), 4.5, ropeCol3D);
  }

  // 5. 상위 "UI" 레이어에 공통 2D HUD 렌더링 (HudPainter + HudText)
  d.beginFrame();
  drawCommonHUDNative(d, W, H, session);
  d.endFrame();
})(runtimeScene);

};
gdjs.MainSceneCode.eventsList0 = function(runtimeScene) {

{


gdjs.MainSceneCode.userFunc0xa780f0(runtimeScene);

}


};

gdjs.MainSceneCode.func = function(runtimeScene) {
runtimeScene.getOnceTriggers().startNewFrame();

gdjs.MainSceneCode.GDStageBox3DObjects1.length = 0;
gdjs.MainSceneCode.GDHudPainterObjects1.length = 0;
gdjs.MainSceneCode.GDHudTextObjects1.length = 0;

gdjs.MainSceneCode.eventsList0(runtimeScene);
gdjs.MainSceneCode.GDStageBox3DObjects1.length = 0;
gdjs.MainSceneCode.GDHudPainterObjects1.length = 0;
gdjs.MainSceneCode.GDHudTextObjects1.length = 0;


return;

}

gdjs['MainSceneCode'] = gdjs.MainSceneCode;
