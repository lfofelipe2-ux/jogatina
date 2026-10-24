# Visual review of the table UI (proposal only)

Status: PROPOSAL. No file under apps/, packages/ or the repo root was changed.
The owner must approve each visual change before it is implemented.

Scope: the dev mock route `/dev/mock` with `?v=play` and `?v=result`, rendered
at 375x812 (phone) and 1280x800 (desktop). Screenshots are in
/tmp/claude/visual/ (phone-play.png, phone-result.png, desktop-play.png,
desktop-result.png). The mock API returns HTTP 500 for two resources (no
socket server), which does not affect the layout. No horizontal page scroll
at either size.

## What works

- The felt table with an oval rim, the seat boxes around it and the centred
  board give the game an immediately readable structure.
- Turn state is clear: the active seat has a gold outline and a timer bar,
  and the "SUA VEZ" label sits above the action buttons.
- Fold (red) and call (blue) are visually distinct and large enough to tap.
  The raise area (input, slider, pot-fraction chips, gold confirm button) has a
  clear top-to-bottom order.
- After showdown the result banner at the top of the table explains who won
  and with which hand, in two short lines.
- The scoreboard, chat and host panel have consistent card styling. On desktop
  they form a clean right-hand column.
- Tabs on phone (Placar / Chat / Anfitrião) keep the table screen from
  becoming a long scroll.

## What is weak

1. Crowding of seats at 375 px. The table is only about 350 px wide, so the
   seats (Diego at top, Bruno and Carla at the sides, Elisa, Ana at the bottom)
   sit on or past the rim. Seat boxes overlap the felt edge and the chip
   labels. The two empty seats ("Vago", Carla when sitting out) are drawn as
   dim boxes that are hard to tell apart.
2. Pot text collides with bet chips. "Pote: 340" and "Pote paralelo 1: 120"
   sit in the centre, and the "200" bet chip of the big blind overlaps the
   second line of the pot text on both phone screenshots.
3. Action bar height and the bottom of the table. On phone the action bar is
   about 250 px tall (buttons, raise row, chips, confirm). It is sticky, so
   on a short phone it covers the bottom of the table, including the local
   player's own hole cards. On desktop (1280x800) the action panel is placed
   directly below the table and clips the bottom of Ana's seat, cutting her
   second hole card.
4. Small text. Seat badges (SB, BB, "Ausente", "All-in") use 9 px text. Seat
   stacks use 11 px. Scoreboard headers use 10 px uppercase, and the
   "MÃOS GANHAS / MAIOR POTE / MÃOS JOGADAS" headers wrap into two lines.
   The bet chips use 11 px.
5. Contrast. Dimmed seats (Carla, Elisa, the sitting-out rows) use grey and
   low-opacity emerald on a green felt or on dark slate, which falls below
   WCAG AA for small text. The "Pote paralelo" line is white on green with
   a busy background. The 40/200 chips use dark text on amber, which is
   fine, but the pot label is not.
6. Desktop column clipping. In the Placar table the last column ("MÃOS
   JOGADAS") is cut off at the right edge of the card ("JO" is visible).
   The table has a min width of 320 px and the card is narrower.
7. Dead space. On phone there is about 80 px of empty space between the
   confirm button and the tab bar. On desktop the table takes only the top
   half of the left column, and the lower-left area stays empty while the
   action panel floats under the table.

## Proposed changes (3 to 5)

### Change 1: Scale the table to the phone width and move seats to the rim
- File: apps/web/src/components/Table.tsx (felt and seat positioning),
  apps/web/src/components/Seat.tsx (seat box size).
- Change in words: make the felt use the full phone width with a slightly
  taller oval (aspect ratio of about 1.25 instead of the current flat oval),
  and place the seats on the rim with a small inset so that seat boxes no
  longer overlap the felt border. Reduce the seat box to a compact size on
  narrow screens (about 84 px wide) and keep the full size from 640 px up.
- Reason: this removes the crowding at 375 px (problem 1) and gives the
  centre area room for the pot and board.

### Change 2: Move the pot label out of the card-and-chip area
- File: apps/web/src/components/Table.tsx (pot line and the bet chip
  positions around the table).
- Change in words: show the main pot and the side pots on one line above the
  board, in a small pill (for example "Pote 340 · paralelo 120"), and keep
  bet chips on the seat-to-centre line with a fixed offset so they never
  sit on top of the pot text. On phone, drop the "Pote paralelo" wording to
  "Paralelo" if needed.
- Reason: problem 2 (text and chip overlap, seen in both phone screenshots).

### Change 3: Shorter sticky action bar on phone, and reserve the table height
- File: apps/web/src/components/ActionBar.tsx (layout and the sticky class),
  apps/web/src/components/GameView.tsx (the space given to the table).
- Change in words: on phone, put the raise input and the slider on one row
  and the pot-fraction chips on a second row, so the bar drops from about
  250 px to about 170 px. On desktop, place the action panel after the
  table with a fixed gap, so it no longer covers Ana's seat. Keep the big
  fold and call buttons as they are, since they are the main tap targets.
- Reason: problems 3 and 7. The local player's cards stay visible on a
  short phone and on desktop.

### Change 4: Raise the minimum text size and contrast
- File: apps/web/src/components/Seat.tsx (badge and stack text sizes),
  apps/web/src/components/Scoreboard.tsx (header size and column widths),
  apps/web/src/index.css (the dimmed-seat and felt-label colour tokens).
- Change in words: set the badges to 10 px minimum and the stack to 12 px,
  and raise the dimmed seat text to a lighter tint so the sitting-out and
  empty seats keep at least 4.5:1 contrast. Use a dark translucent backing
  for the "Pote paralelo" text. In the scoreboard, shorten the headers
  (for example "Mãos" with a tooltip, or abbreviations on narrow widths) and
  let the table scroll inside its card instead of clipping the last column.
- Reason: problems 4, 5 and 6. Text stays legible at phone size and no
  column is cut off on desktop.

### Change 5 (optional): Use the empty desktop space
- File: apps/web/src/components/GameView.tsx (desktop grid).
- Change in words: on desktop, let the table take the full height of the
  left column and place the action panel as a fixed block at the bottom of
  that column, so the lower-left area is used and the table can grow.
- Reason: problem 7. This is a polish item and can be skipped if the owner
  prefers the current layout.

## Suggested order

1. Change 3 (action bar and clipping) first, since it hides a player's own
   cards on both sizes.
2. Change 1 (seat crowding at 375 px).
3. Change 2 (pot and chip overlap).
4. Change 4 (text size and contrast).
5. Change 5 only if the owner wants it.

## Not checked in this review

- The v=ended state and the live socket behaviour (the mock API stubs them).
- Dark and light system themes (the screenshots are in the default theme).
- Real card art and real player counts above 5 seats.
- Touch behaviour of the raise slider.
