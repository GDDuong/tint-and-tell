import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { COLS, PALETTE, ROWS } from './game';
import { useLang } from './Lang';
import { playSfx } from './sfx';

const CELL = 50;
const W = COLS * CELL;
const H = ROWS * CELL;
const MIN_DRAG = 5;
const COL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWX';

export type BoardPawn = { key: string; cell: number; color: string };

type Props = {
  candidates?: number[];
  selected?: number | null;
  frame?: boolean;
  pawns?: BoardPawn[];
  ghostColor?: string;
  onCell?: (cell: number) => void;
};

type View = { s: number; x: number; y: number };
type Loupe = { x: number; y: number; cell: number };
type Gesture =
  | { kind: 'paint'; id: number; startX: number; startY: number; last: number | null; moved: boolean }
  | { kind: 'pan'; id: number; startX: number; startY: number; baseX: number; baseY: number }
  | {
      kind: 'pinch';
      startDist: number;
      startScale: number;
      startX: number;
      startY: number;
      centerX: number;
      centerY: number;
    }
  | null;

export default function Board({ candidates = [], selected = null, frame, pawns = [], ghostColor, onCell }: Props) {
  const { t } = useLang();
  const viewportRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View>({ s: 0.3, x: 0, y: 0 });
  const sizeRef = useRef({ w: 0, h: 0 });
  const fitRef = useRef(0.3);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture>(null);
  const [view, setView] = useState<View>(viewRef.current);
  const [loupe, setLoupe] = useState<Loupe | null>(null);

  const commit = (next: View) => {
    viewRef.current = next;
    setView(next);
  };

  const constrain = (next: View): View => {
    const { w, h } = sizeRef.current;
    const min = fitRef.current;
    const s = Math.min(Math.max(next.s, min), min * 8);
    const sw = W * s;
    const sh = H * s;
    const x = sw <= w ? (w - sw) / 2 : Math.min(0, Math.max(w - sw, next.x));
    const y = sh <= h ? (h - sh) / 2 : Math.min(0, Math.max(h - sh, next.y));
    return { s, x, y };
  };

  useLayoutEffect(() => {
    const el = viewportRef.current!;
    const fit = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      sizeRef.current = { w, h };
      const s = Math.min(w / W, h / H);
      fitRef.current = s;
      commit({ s, x: (w - W * s) / 2, y: (h - H * s) / 2 });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = viewportRef.current!;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = event.clientX - rect.left;
      const cy = event.clientY - rect.top;
      const v = viewRef.current;
      const s = Math.min(Math.max(v.s * Math.exp(-event.deltaY * 0.0016), fitRef.current), fitRef.current * 8);
      const bx = (cx - v.x) / v.s;
      const by = (cy - v.y) / v.s;
      commit(constrain({ s, x: cx - bx * s, y: cy - by * s }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const cellAt = (clientX: number, clientY: number): number | null => {
    const rect = viewportRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    const bx = (clientX - rect.left - v.x) / v.s;
    const by = (clientY - rect.top - v.y) / v.s;
    if (bx < 0 || by < 0 || bx >= W || by >= H) return null;
    return Math.floor(by / CELL) * COLS + Math.floor(bx / CELL);
  };

  const localPoint = (clientX: number, clientY: number) => {
    const rect = viewportRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const el = viewportRef.current!;
    el.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    gesture.current = null;
    setLoupe(null);

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const rect = el.getBoundingClientRect();
      const v = viewRef.current;
      gesture.current = {
        kind: 'pinch',
        startDist: Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1),
        startScale: v.s,
        startX: v.x,
        startY: v.y,
        centerX: (a.x + b.x) / 2 - rect.left,
        centerY: (a.y + b.y) / 2 - rect.top,
      };
      return;
    }
    if (pointers.current.size > 2) return;

    if (!onCell || event.shiftKey || event.button === 1) {
      const v = viewRef.current;
      gesture.current = {
        kind: 'pan',
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        baseX: v.x,
        baseY: v.y,
      };
      return;
    }

    const cell = cellAt(event.clientX, event.clientY);
    gesture.current = {
      kind: 'paint',
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      last: cell,
      moved: false,
    };
    if (cell != null) {
      playSfx('tick');
      onCell(cell);
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = pointers.current.get(event.pointerId);
    if (!point) return;
    point.x = event.clientX;
    point.y = event.clientY;
    const current = gesture.current;

    if (current?.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1);
      const rect = viewportRef.current!.getBoundingClientRect();
      const cx = (a.x + b.x) / 2 - rect.left;
      const cy = (a.y + b.y) / 2 - rect.top;
      const s = Math.min(Math.max(current.startScale * (dist / current.startDist), fitRef.current), fitRef.current * 8);
      const bx = (current.centerX - current.startX) / current.startScale;
      const by = (current.centerY - current.startY) / current.startScale;
      commit(constrain({ s, x: cx - bx * s, y: cy - by * s }));
      return;
    }

    if (current?.kind === 'pan' && current.id === event.pointerId) {
      commit(
        constrain({
          s: viewRef.current.s,
          x: current.baseX + event.clientX - current.startX,
          y: current.baseY + event.clientY - current.startY,
        }),
      );
      return;
    }

    if (current?.kind === 'paint' && current.id === event.pointerId) {
      if (!current.moved && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > MIN_DRAG) {
        current.moved = true;
      }
      const cell = cellAt(event.clientX, event.clientY);
      if (cell != null && cell !== current.last) {
        current.last = cell;
        onCell?.(cell);
      }
      if (current.moved && cell != null) {
        setLoupe({ ...localPoint(event.clientX, event.clientY), cell });
      } else {
        setLoupe(null);
      }
    }
  };

  const endPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    const el = viewportRef.current;
    if (el?.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
    const current = gesture.current;
    if (!current) return;
    if (current.kind === 'paint' && current.id === event.pointerId) {
      gesture.current = null;
      setLoupe(null);
    } else if (current.kind === 'pan' && current.id === event.pointerId) {
      gesture.current = null;
    } else if (current.kind === 'pinch' && pointers.current.size < 2) {
      gesture.current = null;
    }
  };

  const groups = new Map<number, BoardPawn[]>();
  for (const pawn of pawns) {
    const list = groups.get(pawn.cell);
    if (list) list.push(pawn);
    else groups.set(pawn.cell, [pawn]);
  }

  const targetCol = selected != null ? selected % COLS : 0;
  const targetRow = selected != null ? Math.floor(selected / COLS) : 0;

  return (
    <div
      ref={viewportRef}
      className={`board-viewport${onCell ? ' interactive' : ''}`}
      role="group"
      aria-label={t('board.aria')}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        className="board"
        style={{ width: W, height: H, transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}
      >
        <div className="cells">
          {PALETTE.map((entry, index) => (
            <div
              key={index}
              className="cell"
              style={{ '--oklch': entry.oklch, '--hsl': entry.hsl } as CSSProperties}
            />
          ))}
        </div>

        {candidates.map((cell) => (
          <div
            key={`candidate-${cell}`}
            className={`mark${cell === selected ? ' chosen' : ''}`}
            style={{ left: (cell % COLS) * CELL, top: Math.floor(cell / COLS) * CELL }}
          />
        ))}

        {selected != null && frame ? (
          <>
            <div className="frame" style={{ left: (targetCol - 1) * CELL, top: (targetRow - 1) * CELL }} />
            <div className="mark chosen" style={{ left: targetCol * CELL, top: targetRow * CELL }} />
          </>
        ) : null}

        {[...groups].map(([cell, list]) => (
          <div
            key={`pawns-${cell}`}
            className={`pawn-cell n${Math.min(list.length, 4)}`}
            style={{ left: (cell % COLS) * CELL, top: Math.floor(cell / COLS) * CELL }}
          >
            {list.slice(0, 4).map((pawn) => (
              <span key={pawn.key} className="pawn-dot" style={{ background: pawn.color }} />
            ))}
            {list.length > 1 ? <span className="pawn-count">{list.length}</span> : null}
          </div>
        ))}

        {selected != null && ghostColor ? (
          <>
            <div className="pending" style={{ left: targetCol * CELL, top: targetRow * CELL }} />
            <span
              className="pawn-dot ghost"
              style={{ left: targetCol * CELL + 8, top: targetRow * CELL + 8, background: ghostColor }}
            />
          </>
        ) : null}
      </div>

      <div className="coords" aria-hidden="true">
        {Array.from({ length: COLS }, (_, col) => (
          <span
            key={`col-${col}`}
            className="coord"
            style={{ left: view.x + col * CELL * view.s, top: view.y + 2, width: CELL * view.s }}
          >
            {COL_LETTERS[col]}
          </span>
        ))}
        {Array.from({ length: ROWS }, (_, row) => (
          <span
            key={`row-${row}`}
            className="coord"
            style={{ left: view.x + 2, top: view.y + row * CELL * view.s, height: CELL * view.s }}
          >
            {row + 1}
          </span>
        ))}
      </div>

      {loupe
        ? (() => {
            const col = loupe.cell % COLS;
            const row = Math.floor(loupe.cell / COLS);
            return (
              <div
                className="loupe"
                style={{
                  left: `clamp(70px, ${loupe.x}px, calc(100% - 70px))`,
                  top: `clamp(8px, ${loupe.y > 160 ? loupe.y - 168 : loupe.y + 64}px, calc(100% - 148px))`,
                }}
              >
                <div className="loupe-grid">
                  {Array.from({ length: 25 }, (_, index) => {
                    const dx = (index % 5) - 2;
                    const dy = Math.floor(index / 5) - 2;
                    const c = col + dx;
                    const r = row + dy;
                    const inside = c >= 0 && c < COLS && r >= 0 && r < ROWS;
                    const entry = inside ? PALETTE[r * COLS + c] : null;
                    return (
                      <div
                        key={index}
                        className={`loupe-cell${dx === 0 && dy === 0 ? ' center' : ''}`}
                        style={entry ? ({ '--oklch': entry.oklch, '--hsl': entry.hsl } as CSSProperties) : undefined}
                      >
                        {dx === 0 && dy === 0 && ghostColor ? (
                          <span className="loupe-pawn" style={{ background: ghostColor }} />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()
        : null}
    </div>
  );
}
