import type { BodyDrawing, DrawingView } from '../Lib/drawingTypes'
import { circle, roundRect, shift, symmetric } from './path'

/**
 * Open runabout with an outboard: deck plan from above, port profile with the
 * bow to the left, bow-on and stern-on views.
 */

// Deck plan. The port side is the lower half (y > 500), the same convention as the cars.
const top: DrawingView = symmetric({
  axis: 'y',
  panels: [
    {
      id: 'gunwale_port',
      d: 'M60 500 C160 585 380 700 600 700 L870 700 Q900 700 900 668 L900 660 L878 660 L878 678 L600 678 C545 678 490 672 430 658 C408 652 384 644 356 634 L330 620 C240 588 170 545 110 512 Z',
    },
    {
      id: 'bow',
      d: 'M110 512 C170 545 240 588 330 620 L330 380 C240 412 170 455 110 488 Z',
    },
    { id: 'windscreen', d: 'M330 620 L356 634 L356 366 L330 380 Z' },
    {
      id: 'cabin',
      d: 'M356 634 C384 644 408 652 430 658 L430 342 C408 348 384 356 356 366 Z',
    },
    {
      id: 'deck',
      d: 'M430 658 C490 672 545 678 600 678 L840 678 L840 322 L600 322 C545 322 490 328 430 342 Z',
    },
    { id: 'stern', d: 'M840 678 L878 678 L878 322 L840 322 Z' },
    { id: 'transom', d: 'M878 660 L900 660 L900 340 L878 340 Z' },
    {
      id: 'outboard',
      d: 'M904 470 Q904 450 924 450 L960 450 Q984 450 984 475 L984 525 Q984 550 960 550 L924 550 Q904 550 904 530 Z',
    },
  ],
  centreLines: [
    // foredeck hatch, helm wheel, seats and rear bench
    roundRect(150, 468, 110, 64, 14),
    circle(392, 590, 16),
    roundRect(445, 540, 66, 62, 10),
    roundRect(445, 398, 66, 62, 10),
    roundRect(760, 372, 60, 256, 12),
    // outboard tiller/bracket
    'M900 500 L904 500',
  ],
})

const left: DrawingView = shift(
  {
    panels: [
      {
        id: 'gunwale_port',
        d: 'M60 420 C130 406 215 402 300 402 C430 402 570 408 700 416 C760 420 830 428 882 436 L882 452 C830 444 760 436 700 432 C570 424 430 418 300 418 C220 418 140 424 82 436 Z',
      },
      {
        id: 'bow',
        d: 'M82 436 C96 470 118 510 140 542 L152 526 C200 540 250 550 300 556 L300 418 C220 418 140 424 82 436 Z',
      },
      {
        id: 'port_hull',
        d: 'M300 418 C430 418 570 424 700 432 L700 570 C570 568 430 562 300 556 Z',
      },
      {
        id: 'stern',
        d: 'M700 432 C760 436 830 444 882 452 L888 572 C830 572 760 571 700 570 Z',
      },
      {
        id: 'keel',
        d: 'M140 542 C190 556 245 566 300 572 C430 586 570 590 700 590 C760 590 830 590 888 590 L888 572 C830 572 760 571 700 570 C570 568 430 562 300 556 C250 550 200 540 152 526 Z',
      },
      { id: 'transom', d: 'M882 436 L900 436 L900 590 L888 590 L888 572 L882 452 Z' },
      { id: 'windscreen', d: 'M330 402 L378 332 Q383 326 392 326 L412 326 L392 404 Z' },
      { id: 'cabin', d: 'M392 404 L412 326 L520 330 Q540 332 542 352 L548 410 Z' },
      {
        id: 'outboard',
        d: 'M900 438 L900 376 Q900 360 916 360 L968 360 Q986 360 986 378 L986 462 Q986 474 972 474 L958 474 L964 586 Q966 600 950 600 L936 600 Q930 600 930 586 L928 474 L906 474 Q900 474 900 462 Z',
      },
    ],
    lines: [
      // chine
      'M150 500 C300 530 600 545 888 548',
      // windscreen frame and helm wheel
      'M352 398 L392 340',
      circle(470, 352, 14),
      // cowl split and anti-ventilation plate
      'M900 440 L986 440',
      'M924 562 L972 564',
    ],
  },
  0,
  40
)

// Bow-on: port is on the viewer's right.
const front: DrawingView = symmetric({
  axis: 'x',
  panels: [
    { id: 'keel', d: 'M500 700 L484 600 L516 600 Z' },
    { id: 'bow', d: 'M484 600 L470 380 L530 380 L516 600 Z' },
    {
      id: 'port_hull',
      d: 'M530 380 L790 380 C790 470 650 600 500 700 L516 600 Z',
    },
    { id: 'gunwale_port', d: 'M500 360 L770 360 Q790 360 790 380 L500 380 Z' },
    { id: 'windscreen', d: 'M300 360 L330 290 Q500 270 670 290 L700 360 Z' },
  ],
  centreLines: ['M500 272 L500 360', circle(500, 470, 9)],
  sideLines: ['M540 400 C640 470 700 530 720 560'],
})

// Stern-on: port is on the viewer's left.
const rear: DrawingView = symmetric({
  axis: 'x',
  panels: [
    {
      id: 'transom',
      d: 'M215 380 L472 380 L472 596 L240 560 Z M785 380 L528 380 L528 596 L760 560 Z',
    },
    { id: 'port_hull', d: 'M240 560 L472 596 L472 612 L226 576 Z' },
    { id: 'gunwale_port', d: 'M215 380 L500 380 L500 364 L222 364 Z' },
    { id: 'windscreen', d: 'M310 364 L335 300 Q500 282 665 300 L690 364 Z' },
    {
      id: 'outboard',
      d: 'M462 380 L462 300 Q462 280 482 280 L518 280 Q538 280 538 300 L538 380 L528 380 L528 640 Q528 660 508 660 L492 660 Q472 660 472 640 L472 380 Z',
    },
  ],
  centreLines: ['M462 350 L538 350', 'M452 600 L548 600', 'M500 282 L500 364'],
  sideLines: [roundRect(250, 410, 90, 40, 6)],
})

export const boat: BodyDrawing = {
  body: 'boat',
  views: { top, left, front, rear },
}

export default boat
