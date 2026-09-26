import type { BodyDrawing, DrawingPanel, DrawingView } from '../Lib/drawingTypes'
import { circle, flipY, n, roundRect, shift, symmetric, wheel } from './path'

/** A band between two radii around a centre, from angle a0 to a1 (degrees, clockwise on screen). */
function arcBand(cx: number, cy: number, ro: number, ri: number, a0: number, a1: number): string {
  const p = (r: number, a: number) =>
    `${n(cx + r * Math.cos((a * Math.PI) / 180))} ${n(cy + r * Math.sin((a * Math.PI) / 180))}`
  const large = a1 - a0 > 180 ? 1 : 0
  return `M${p(ro, a0)} A${n(ro)} ${n(ro)} 0 ${large} 1 ${p(ro, a1)} L${p(ri, a1)} A${n(ri)} ${n(ri)} 0 ${large} 0 ${p(ri, a0)} Z`
}

const front = wheel('front_wheel', 240, 630, 112)
const rear = wheel('rear_wheel', 750, 630, 112)

const left: DrawingView = shift(
  {
    panels: [
      front.panel,
      rear.panel,
      { id: 'front_fender', d: arcBand(240, 630, 140, 122, -155, -35) },
      { id: 'rear_fender', d: arcBand(750, 630, 140, 122, -100, -12) },
      {
        id: 'tank',
        d: 'M540 440 Q480 400 400 408 Q378 412 376 436 L380 470 Q420 482 470 478 L540 470 Z',
      },
      { id: 'seat', d: 'M540 440 Q610 430 690 432 L690 470 L540 470 Z' },
      { id: 'tail', d: 'M690 432 L770 424 Q815 420 812 448 L790 478 L690 470 Z' },
      { id: 'left_fairing', d: 'M380 470 Q420 482 470 478 L445 540 Q420 548 392 540 Z' },
      {
        id: 'exhaust',
        d: 'M560 584 L840 590 Q854 591 854 606 L840 620 L560 614 Q548 600 560 584 Z',
      },
      { id: 'headlamp', d: circle(300, 440, 34) },
      { id: 'front_fairing', d: 'M282 406 Q300 372 340 368 L346 382 Q322 388 312 412 Z' },
      {
        id: 'handlebars',
        d: 'M330 394 L392 380 Q410 376 412 390 L398 398 L334 410 Q322 404 330 394 Z',
      },
    ],
    lines: [
      ...front.lines,
      ...rear.lines,
      // forks, above and below the fender
      'M297 474 L287 500',
      'M311 476 L301 504',
      'M282 517 L246 616',
      'M296 518 L260 618',
      // frame, engine, swingarm, shock
      'M470 478 L556 556',
      roundRect(450, 498, 140, 100, 18),
      'M560 570 L742 624',
      'M566 592 L744 636',
      'M640 478 L600 566',
      // exhaust header
      'M404 548 Q398 596 440 600 L560 600',
      'M420 548 Q416 586 446 588 L560 588',
      // headlamp lens
      circle(300, 440, 22),
    ],
  },
  0,
  -45
)

const topPanels: DrawingPanel[] = [
  {
    id: 'front_wheel',
    d: 'M128 500 Q128 482 146 482 L158 482 L158 518 L146 518 Q128 518 128 500 Z M262 482 L276 482 L276 518 L262 518 Z',
  },
  { id: 'front_fender', d: roundRect(158, 470, 104, 60, 22) },
  { id: 'headlamp', d: circle(302, 500, 24) },
  { id: 'front_fairing', d: 'M326 452 L344 438 L344 562 L326 548 Z' },
  { id: 'handlebars', d: roundRect(348, 356, 18, 288, 9) },
  {
    id: 'tank',
    d: 'M382 500 Q384 432 450 424 L540 424 L540 576 L450 576 Q384 568 382 500 Z',
  },
  { id: 'seat', d: 'M540 424 L690 432 L690 568 L540 576 Z' },
  { id: 'tail', d: 'M690 432 L760 446 Q790 450 790 500 Q790 550 760 554 L690 568 Z' },
  { id: 'rear_fender', d: roundRect(790, 476, 40, 48, 12) },
  { id: 'rear_wheel', d: 'M830 478 L864 478 Q882 478 882 500 Q882 522 864 522 L830 522 Z' },
  { id: 'left_fairing', d: 'M400 570 L470 582 L466 602 L404 600 Z' },
  { id: 'right_fairing', d: flipY('M400 570 L470 582 L466 602 L404 600 Z') },
  {
    id: 'exhaust',
    d: 'M560 590 L846 594 Q858 596 858 610 L846 624 L560 620 Q548 605 560 590 Z',
  },
]

const top: DrawingView = {
  panels: topPanels,
  lines: [
    // fork tubes either side of the front wheel
    'M348 470 L276 470',
    'M348 530 L276 530',
    // grips
    'M348 356 L366 356 M348 644 L366 644',
    'M352 384 L362 384',
    'M352 616 L362 616',
  ],
}

const frontView: DrawingView = symmetric({
  axis: 'x',
  panels: [
    {
      id: 'front_wheel',
      d: 'M462 556 Q462 522 500 520 Q538 522 538 556 L538 742 Q538 780 500 780 Q462 780 462 742 Z',
    },
    {
      id: 'front_fender',
      d: 'M456 556 Q456 500 500 498 Q544 500 544 556 L538 556 Q538 522 500 520 Q462 522 462 556 Z',
    },
    { id: 'headlamp', d: circle(500, 430, 44) },
    { id: 'front_fairing', d: 'M430 392 Q500 346 570 392 L556 400 Q500 366 444 400 Z' },
    { id: 'handlebars', d: roundRect(320, 336, 360, 22, 11) },
    { id: 'left_fairing', d: 'M548 470 L606 486 L600 590 L548 580 Z' },
  ],
  centreLines: [
    'M450 404 L450 660',
    'M550 404 L550 660',
    'M440 400 L560 400',
    circle(500, 430, 30),
  ],
})

const rearView: DrawingView = symmetric({
  axis: 'x',
  panels: [
    {
      id: 'rear_wheel',
      d: 'M452 548 Q452 514 500 512 Q548 514 548 548 L548 742 Q548 780 500 780 Q452 780 452 742 Z',
    },
    {
      id: 'rear_fender',
      d: 'M444 548 Q444 490 500 488 Q556 490 556 548 L548 548 Q548 514 500 512 Q452 514 452 548 Z',
    },
    { id: 'tail', d: 'M432 378 Q500 360 568 378 L578 440 L422 440 Z' },
    { id: 'seat', d: 'M440 356 Q500 344 560 356 L568 378 Q500 360 432 378 Z' },
    { id: 'handlebars', d: roundRect(320, 330, 360, 22, 11) },
    { id: 'exhaust', d: circle(410, 610, 24) },
  ],
  centreLines: [
    roundRect(470, 448, 60, 34, 4),
    roundRect(478, 400, 44, 22, 6),
    circle(410, 610, 14),
  ],
})

export const motorcycle: BodyDrawing = {
  body: 'motorcycle',
  views: { left, top, front: frontView, rear: rearView },
}

export default motorcycle
