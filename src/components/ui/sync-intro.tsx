/**
 * SyncIntro - the welcome animation. Two halves fly in, lock with a ring pop,
 * turn once, then slide left to make room for the wordmark and tagline.
 *
 * Ported from the supplied sync-intro.html. The timing table and the render
 * maths are VERBATIM - they are tuned, and re-deriving them by eye would only
 * lose fidelity. What changed for the app:
 *
 *   - The 55KB base64 JetBrains Mono is gone. The app already self-hosts that
 *     face via next/font, so the tagline uses var(--font-jetbrains-mono).
 *   - Element ids are scoped with useId. The original used global ids, and
 *     `clipPath id="wordclip"` in particular would collide the moment a second
 *     instance mounted - SVG ids share one document namespace.
 *   - rAF is driven from an effect and cancelled on unmount.
 *   - prefers-reduced-motion renders the settled frame instead of animating.
 *   - The Replay button and ?capture mode were authoring aids; dropped.
 */
'use client';

import { useEffect, useId, useRef } from 'react';

/** Total runtime in seconds. Callers need this to know when to fade out. */
export const SYNC_INTRO_DURATION = 4.7;

/**
 * Mark diameter as a fraction of the smaller viewport side. Everything else
 * in the lockup is derived from it, so this is the one number to change if
 * the intro needs to be bigger or smaller.
 */
const MARK_SCALE = 0.155;

/** Natural width of the wordmark path, used to size the reveal wipe. */
const WM_W = 359.697;

const T: Record<string, [number, number]> = {
  enter: [0.15, 1.0],
  lock: [1.0, 1.3],
  pop: [1.26, 1.46],
  spin: [1.5, 2.3],
  slide: [2.3, 2.62],
  word: [2.46, 3.0],
  tag: [3.0, 3.45],
  hold: [3.45, 4.3],
  out: [4.3, 4.7],
};

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const span = (t: number, k: string) => clamp((t - T[k][0]) / (T[k][1] - T[k][0]), 0, 1);
const outCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const outQuint = (p: number) => 1 - Math.pow(1 - p, 5);
const inOutCubic = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

/** A settle that overshoots once and comes back. */
const backOut = (p: number) => {
  const c = 1.70158;
  const c3 = c + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
};

const LEFT_PATH = 'M 50,10 C 61.9,10 61.9,50 48.4,50 C 34.9,50 34.9,90 50,90 A 40,40 0 0 1 50,10 Z';
const RIGHT_PATH = 'M 50,10 C 65.1,10 65.1,50 51.6,50 C 38.1,50 38.1,90 50,90 A 40,40 0 0 0 50,10 Z';

/** The "Sync" wordmark, Bricolage Grotesque ExtraBold converted to outlines. */
const WORDMARK_PATH =
  'M50.151515151515156 2.121212121212121Q40.45454545454545 2.121212121212121 32.57575757575758 0.303030303030303Q24.6969696969697 -1.5151515151515151 18.93939393939394 -5.2272727272727275Q13.181818181818182 -8.93939393939394 9.848484848484848 -14.696969696969699Q6.515151515151516 -20.454545454545457 5.909090909090909 -28.03030303030303L27.272727272727273 -35.151515151515156Q27.727272727272727 -28.78787878787879 30.90909090909091 -24.545454545454547Q34.09090909090909 -20.303030303030305 39.46969696969697 -18.257575757575758Q44.84848484848485 -16.21212121212121 51.515151515151516 -16.21212121212121Q57.87878787878788 -16.21212121212121 62.1969696969697 -17.803030303030305Q66.51515151515152 -19.393939393939394 68.71212121212122 -21.893939393939394Q70.9090909090909 -24.393939393939394 70.9090909090909 -27.272727272727273Q70.9090909090909 -30.606060606060606 68.03030303030303 -32.803030303030305Q65.15151515151516 -35.0 60.151515151515156 -36.59090909090909Q55.151515151515156 -38.18181818181818 48.484848484848484 -39.696969696969695Q40.909090909090914 -41.515151515151516 33.63636363636364 -43.63636363636364Q26.363636363636363 -45.75757575757576 20.454545454545453 -49.16666666666667Q14.545454545454547 -52.57575757575758 11.136363636363637 -57.95454545454545Q7.7272727272727275 -63.333333333333336 7.7272727272727275 -71.51515151515152Q7.7272727272727275 -80.75757575757576 12.424242424242424 -87.57575757575758Q17.12121212121212 -94.39393939393939 26.21212121212121 -98.25757575757575Q35.303030303030305 -102.12121212121212 48.63636363636364 -102.12121212121212Q61.81818181818182 -102.12121212121212 71.06060606060606 -98.33333333333334Q80.30303030303031 -94.54545454545455 85.30303030303031 -87.80303030303031Q90.30303030303031 -81.06060606060606 90.75757575757576 -72.12121212121212L68.93939393939394 -65.9090909090909Q68.93939393939394 -70.30303030303031 67.5 -73.63636363636364Q66.06060606060606 -76.96969696969697 63.484848484848484 -79.16666666666666Q60.909090909090914 -81.36363636363636 57.121212121212125 -82.5Q53.333333333333336 -83.63636363636364 48.484848484848484 -83.63636363636364Q42.72727272727273 -83.63636363636364 38.71212121212121 -82.27272727272728Q34.696969696969695 -80.9090909090909 32.72727272727273 -78.71212121212122Q30.757575757575758 -76.51515151515152 30.757575757575758 -73.63636363636364Q30.757575757575758 -70.0 33.86363636363636 -67.65151515151516Q36.96969696969697 -65.30303030303031 42.348484848484844 -63.71212121212122Q47.72727272727273 -62.121212121212125 54.24242424242424 -60.60606060606061Q60.75757575757576 -59.24242424242424 67.72727272727273 -57.1969696969697Q74.6969696969697 -55.151515151515156 80.75757575757576 -51.81818181818182Q86.81818181818183 -48.484848484848484 90.53030303030303 -42.803030303030305Q94.24242424242425 -37.121212121212125 94.24242424242425 -28.484848484848484Q94.24242424242425 -19.242424242424242 89.31818181818181 -12.348484848484848Q84.39393939393939 -5.454545454545455 74.54545454545455 -1.666666666666667Q64.6969696969697 2.121212121212121 50.151515151515156 2.121212121212121Z M137.12121212121212 27.87878787878788Q131.06060606060606 27.87878787878788 124.69696969696969 26.81818181818182Q118.33333333333333 25.757575757575758 112.65151515151516 23.71212121212121Q106.96969696969697 21.666666666666668 102.87878787878788 18.333333333333332L108.78787878787878 -3.3333333333333335Q114.0909090909091 1.6666666666666667 121.5909090909091 4.090909090909091Q129.0909090909091 6.515151515151516 136.06060606060606 6.515151515151516Q144.0909090909091 6.515151515151516 149.3181818181818 3.409090909090909Q154.54545454545456 0.30303030303030304 157.34848484848487 -6.136363636363637Q160.15151515151516 -12.575757575757576 160.60606060606062 -22.12121212121212L161.36363636363637 -35.303030303030305H157.72727272727272Q156.36363636363637 -25.454545454545457 152.95454545454547 -19.242424242424242Q149.54545454545456 -13.030303030303031 144.3181818181818 -10.075757575757576Q139.0909090909091 -7.121212121212121 131.96969696969697 -7.121212121212121Q123.18181818181819 -7.121212121212121 117.27272727272728 -11.515151515151516Q111.36363636363636 -15.90909090909091 108.4090909090909 -24.772727272727273Q105.45454545454545 -33.63636363636364 105.45454545454545 -46.81818181818182V-80.0H130.0V-52.87878787878788Q130.0 -38.93939393939394 132.8030303030303 -32.95454545454545Q135.60606060606062 -26.96969696969697 141.66666666666666 -26.96969696969697Q144.84848484848484 -26.96969696969697 147.42424242424244 -28.78787878787879Q150.0 -30.606060606060606 151.8181818181818 -33.93939393939394Q153.63636363636363 -37.27272727272727 154.62121212121212 -42.04545454545455Q155.60606060606062 -46.81818181818182 155.60606060606062 -52.72727272727273V-80.0H180.0V-21.21212121212121Q180.0 -11.666666666666668 178.25757575757575 -3.7878787878787885Q176.5151515151515 4.090909090909091 173.1060606060606 10.0Q169.6969696969697 15.90909090909091 164.54545454545456 19.924242424242426Q159.3939393939394 23.93939393939394 152.57575757575756 25.90909090909091Q145.75757575757575 27.87878787878788 137.12121212121212 27.87878787878788Z M195.75757575757578 0.0V-48.18181818181818V-80.0H215.45454545454547L215.75757575757578 -56.515151515151516H218.7878787878788Q220.75757575757578 -65.0 224.3939393939394 -70.75757575757575Q228.03030303030303 -76.51515151515152 233.63636363636363 -79.31818181818181Q239.24242424242425 -82.12121212121212 246.8181818181818 -82.12121212121212Q260.90909090909093 -82.12121212121212 268.25757575757575 -72.27272727272728Q275.6060606060606 -62.42424242424243 275.6060606060606 -40.909090909090914V0.0H251.06060606060606V-38.18181818181818Q251.06060606060606 -50.60606060606061 247.5 -56.28787878787879Q243.93939393939394 -61.96969696969697 236.969696969697 -61.96969696969697Q231.21212121212122 -61.96969696969697 227.5 -58.484848484848484Q223.7878787878788 -55.0 221.969696969697 -49.24242424242424Q220.15151515151516 -43.484848484848484 220.15151515151516 -36.36363636363637V0.0Z M328.1818181818182 2.121212121212121Q317.8787878787879 2.121212121212121 310.0 -0.7575757575757578Q302.1212121212121 -3.6363636363636367 296.8181818181818 -9.015151515151516Q291.5151515151515 -14.393939393939394 288.71212121212125 -21.96969696969697Q285.90909090909093 -29.545454545454547 285.90909090909093 -38.93939393939394Q285.90909090909093 -48.63636363636364 288.71212121212125 -56.515151515151516Q291.5151515151515 -64.39393939393939 296.8181818181818 -70.15151515151516Q302.1212121212121 -75.9090909090909 309.8484848484849 -79.01515151515152Q317.57575757575756 -82.12121212121212 327.57575757575756 -82.12121212121212Q337.57575757575756 -82.12121212121212 344.8484848484849 -78.93939393939394Q352.1212121212121 -75.75757575757576 356.74242424242425 -70.0Q361.3636363636364 -64.24242424242425 363.030303030303 -56.66666666666667L340.45454545454544 -49.09090909090909Q340.0 -54.09090909090909 338.030303030303 -57.27272727272727Q336.06060606060606 -60.45454545454545 332.9545454545455 -61.89393939393939Q329.8484848484849 -63.333333333333336 326.21212121212125 -63.333333333333336Q322.42424242424244 -63.333333333333336 319.54545454545456 -61.81818181818182Q316.6666666666667 -60.303030303030305 314.69696969696975 -57.27272727272727Q312.72727272727275 -54.24242424242424 311.6666666666667 -49.92424242424242Q310.6060606060606 -45.60606060606061 310.6060606060606 -40.0Q310.6060606060606 -31.96969696969697 312.6515151515151 -26.59090909090909Q314.6969696969697 -21.21212121212121 318.71212121212125 -18.484848484848484Q322.72727272727275 -15.757575757575758 328.4848484848485 -15.757575757575758Q334.3939393939394 -15.757575757575758 337.72727272727275 -18.18181818181818Q341.06060606060606 -20.606060606060606 342.5757575757576 -24.166666666666664Q344.0909090909091 -27.727272727272727 344.3939393939394 -31.212121212121215L365.6060606060606 -26.515151515151516Q365.0 -20.90909090909091 362.6515151515151 -15.681818181818183Q360.3030303030303 -10.454545454545455 355.75757575757575 -6.4393939393939394Q351.21212121212125 -2.4242424242424243 344.469696969697 -0.1515151515151516Q337.72727272727275 2.121212121212121 328.1818181818182 2.121212121212121Z';

export function SyncIntro({ className }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const pick = (suffix: string) => svg.querySelector<SVGElement>('#' + uid + '-' + suffix);
    const root = pick('root');
    const stage = pick('stage');
    const mark = pick('mark');
    const gl = pick('gl');
    const gr = pick('gr');
    const ring = pick('ring');
    const ringg = pick('ringg');
    const word = pick('word');
    const wipe = pick('wipe');
    const tag = pick('tag');
    if (!root || !stage || !mark || !gl || !gr || !ring || !ringg || !word || !wipe || !tag) return;

    function layout() {
      const W = svg!.viewBox.baseVal.width;
      const H = svg!.viewBox.baseVal.height;
      // Mark diameter drives the whole lockup: cap height, gap and total
      // width all derive from it. 0.28 (the source value) put the lockup at
      // ~66% of viewport width - splash-sized, not hero-sized, is ~0.155.
      const D = Math.min(W, H) * MARK_SCALE; // mark diameter
      const cap = D * (100 / 122); // wordmark cap height, matching the lockup
      const ws = cap / 100;
      const gap = D * (30 / 122);
      const lockW = D + gap + WM_W * ws;
      return { W, H, D, cap, ws, gap, lockW, cx: W / 2, cy: H / 2 };
    }

    function render(t: number) {
      const L = layout();
      const S = L.D / 80; // paths are drawn at r = 40

      // Halves coming together.
      const e = outCubic(span(t, 'enter'));
      const k = backOut(span(t, 'lock'));
      const travel = L.W * 0.42;
      const apart = (1 - e) * travel + (1 - k) * L.D * 0.3;
      const tilt = (1 - e) * 26 + (1 - k) * 6;
      const fade = clamp(span(t, 'enter') * 2.2, 0, 1);

      // The click.
      const pp = span(t, 'pop');
      const pop = pp > 0 && pp < 1 ? 1 + 0.075 * Math.sin(pp * Math.PI) : 1;

      // The lock lands: one lime ring, out and gone.
      if (pp > 0 && pp < 1) {
        const rr = outCubic(pp);
        ring!.setAttribute('r', (40 + 62 * rr).toFixed(2));
        ring!.setAttribute('stroke-width', (5.5 * (1 - rr) + 0.8).toFixed(2));
        ring!.setAttribute('opacity', (0.5 * (1 - rr)).toFixed(3));
      } else {
        ring!.setAttribute('opacity', '0');
      }
      ringg!.setAttribute('transform', 'scale(' + S.toFixed(4) + ')');

      // One turn as one object.
      const spin = inOutCubic(span(t, 'spin')) * 360;

      // Mark slides left to open room for the wordmark.
      const sl = outQuint(span(t, 'slide'));
      const restX = L.cx - L.D / 2; // mark left edge, centred alone
      const lockX = L.cx - L.lockW / 2; // mark left edge, inside the lockup
      const markLeft = restX + (lockX - restX) * sl;
      const markCx = markLeft + L.D / 2;

      // Exit.
      const o = span(t, 'out');
      const globalFade = 1 - o;
      // The mark plays large on its own, then the lockup scales to fit.
      const fit = Math.min(1, (L.W * 0.8) / L.lockW);
      const globalScale = (1 + (fit - 1) * sl) * (1 - o * 0.04);

      root!.setAttribute('opacity', globalFade.toFixed(4));
      root!.setAttribute(
        'transform',
        'translate(' + L.cx + ',' + L.cy + ') scale(' + globalScale.toFixed(4) + ') translate(' + -L.cx + ',' + -L.cy + ')',
      );

      stage!.setAttribute('transform', 'translate(' + markCx.toFixed(2) + ',' + L.cy + ')');
      mark!.setAttribute('transform', 'rotate(' + spin.toFixed(2) + ') scale(' + (S * pop).toFixed(4) + ')');

      gl!.setAttribute('transform', 'translate(' + (-apart / S).toFixed(2) + ',0) rotate(' + (-tilt).toFixed(2) + ')');
      gr!.setAttribute('transform', 'translate(' + (apart / S).toFixed(2) + ',0) rotate(' + tilt.toFixed(2) + ')');
      gl!.setAttribute('opacity', fade.toFixed(3));
      gr!.setAttribute('opacity', fade.toFixed(3));

      // Wordmark.
      const w = outQuint(span(t, 'word'));
      const wx = markLeft + L.D + L.gap;
      const wy = L.cy - L.cap / 2;
      word!.setAttribute(
        'transform',
        'translate(' + (wx - (1 - w) * L.D * 0.1).toFixed(2) + ',' + wy.toFixed(2) + ') scale(' + L.ws.toFixed(5) + ')',
      );
      word!.setAttribute('opacity', w.toFixed(3));
      wipe!.setAttribute('width', (WM_W * w).toFixed(2));

      // Tagline.
      const g = outCubic(span(t, 'tag'));
      tag!.setAttribute('opacity', (g * 0.62).toFixed(3));
      tag!.setAttribute('y', (L.cy + L.D * 0.92 + (1 - g) * L.D * 0.09).toFixed(2));
      tag!.setAttribute('x', L.cx.toFixed(2));
      tag!.setAttribute('font-size', (L.D * 0.125).toFixed(2));
      tag!.setAttribute('letter-spacing', (L.D * 0.017).toFixed(3));
    }

    // Reduced motion: show the settled lockup, never animate it.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      render(T.hold[0]);
      return;
    }

    let raf = 0;
    let startTs: number | null = null;
    const step = (ts: number) => {
      if (startTs === null) startTs = ts;
      const t = (ts - startTs) / 1000;
      render(Math.min(t, SYNC_INTRO_DURATION));
      if (t < SYNC_INTRO_DURATION) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    // Keep the lockup centred if the frame changes mid-play.
    const onResize = () => render(SYNC_INTRO_DURATION * 0.8);
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [uid]);

  return (
    // Decorative: the surrounding splash already announces loading state.
    <div className={className} aria-hidden="true">
      <svg
        ref={svgRef}
        viewBox="0 0 1920 1080"
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full"
      >
        <rect width="1920" height="1080" fill="#0E0E12" />
        <defs>
          <clipPath id={uid + '-wordclip'}>
            <rect id={uid + '-wipe'} x="-6" y="-40" width="0" height="200" />
          </clipPath>
        </defs>

        <g id={uid + '-root'}>
          <g id={uid + '-stage'}>
            <g id={uid + '-ringg'}>
              <circle id={uid + '-ring'} cx="0" cy="0" r="40" fill="none" stroke="#C5FF4A" opacity="0" />
            </g>
            <g id={uid + '-mark'}>
              <g id={uid + '-gl'}>
                <g transform="translate(-50,-50)">
                  <path d={LEFT_PATH} fill="#C5FF4A" />
                </g>
              </g>
              <g id={uid + '-gr'}>
                <g transform="translate(-50,-50)">
                  <path d={RIGHT_PATH} fill="#F4F1E8" />
                </g>
              </g>
            </g>
          </g>

          <g id={uid + '-word'} opacity="0" clipPath={'url(#' + uid + '-wordclip)'} fill="#F4F1E8">
            <g transform="translate(-5.909,102.121)">
              <path d={WORDMARK_PATH} />
            </g>
          </g>

          <text
            id={uid + '-tag'}
            textAnchor="middle"
            opacity="0"
            fill="#F4F1E8"
            fontFamily="var(--font-jetbrains-mono), ui-monospace, monospace"
            fontWeight={500}
          >
            CONNECT · SEARCH · SYNC
          </text>
        </g>
      </svg>
    </div>
  );
}
