import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor,
  useSensor, useSensors, closestCenter, MeasuringStrategy,
} from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const LIFT_GREEN = "#3dd56a";
const HOLD_MS = 500;
const MOVE_TOLERANCE_PX = 8;

/* A hold must never start on the + / − buttons (or anything marked data-no-dnd). */
const startsOnNoDnd = (event) => !!event?.target?.closest?.("[data-no-dnd]");

class HoldTouchSensor extends TouchSensor {
  static activators = [{
    eventName: "onTouchStart",
    handler: (e, opts) => !startsOnNoDnd(e.nativeEvent) && TouchSensor.activators[0].handler(e, opts),
  }];
}

class HoldMouseSensor extends MouseSensor {
  static activators = [{
    eventName: "onMouseDown",
    handler: (e, opts) => !startsOnNoDnd(e.nativeEvent) && MouseSensor.activators[0].handler(e, opts),
  }];
}

/* Keep the dragged card on a vertical line. */
const verticalOnly = ({ transform }) => ({ ...transform, x: 0 });

/* Set while a dnd hold/drag is live and for ~50ms after it ends, so letting go
   after a hold (which opens settings) never also counts as a tap. */
const dndGuard = { active: false, timer: null };
const armDndGuard = () => { clearTimeout(dndGuard.timer); dndGuard.active = true; };
const releaseDndGuard = () => {
  clearTimeout(dndGuard.timer);
  dndGuard.timer = setTimeout(() => { dndGuard.active = false; }, 50);
};

/* A real tap only: the finger moved < MOVE_TOLERANCE_PX and lifted within HOLD_MS.
   Unlike TouchButton, a scroll that starts on it never fires it. */
function TapArea({ onTap, as: Tag = "div", style, children, ...rest }) {
  const start = useRef(null);
  const touched = useRef(false);

  const begin = (x, y) => { start.current = { x, y, t: Date.now(), moved: false }; };
  const track = (x, y) => {
    const s = start.current;
    if (s && Math.hypot(x - s.x, y - s.y) >= MOVE_TOLERANCE_PX) s.moved = true;
  };
  const finish = (x, y) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    track(x, y);
    if (s.moved || Date.now() - s.t >= HOLD_MS || dndGuard.active) return;
    onTap();
  };

  const roleProps = Tag === "button" ? { type: "button" } : { role: "button", tabIndex: 0 };
  return (
    <Tag
      {...roleProps}
      onTouchStart={e => { touched.current = true; const t = e.touches[0]; if (t) begin(t.clientX, t.clientY); }}
      onTouchMove={e => { const t = e.touches[0]; if (t) track(t.clientX, t.clientY); }}
      onTouchEnd={e => { const t = e.changedTouches[0]; if (t) finish(t.clientX, t.clientY); }}
      onTouchCancel={() => { start.current = null; }}
      onMouseDown={e => { if (!touched.current && e.button === 0) begin(e.clientX, e.clientY); }}
      onMouseMove={e => { if (!touched.current) track(e.clientX, e.clientY); }}
      onMouseUp={e => { if (!touched.current && e.button === 0) finish(e.clientX, e.clientY); }}
      onMouseLeave={() => { if (!touched.current) start.current = null; }}
      onKeyDown={e => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onTap(); }
      }}
      style={{ WebkitTapHighlightColor: "transparent", cursor: "pointer", ...style }}
      {...rest}
    >{children}</Tag>
  );
}

function Chevron({ up = false, size = 12, color = "rgba(255,255,255,0.45)", style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true"
      style={{ flexShrink: 0, display: "block", transform: up ? "rotate(180deg)" : "none", ...style }}>
      <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DoubleChevron({ up = false }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"
      style={{ flexShrink: 0, display: "block", transition: "transform 0.28s ease", transform: up ? "rotate(180deg)" : "none" }}>
      <path d="M3 2.5 6 5.5l3-3M3 6.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* "Expand all" when any card in the set is collapsed, else "Collapse all". */
function ExpandAllPill({ allOpen, onTap }) {
  return (
    <TapArea as="button" onTap={onTap} style={{
      height: 34, borderRadius: 17, padding: "0 12px", flexShrink: 0,
      background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
      color: "#fff", fontSize: 12, fontWeight: 600, fontFamily: "inherit",
      display: "flex", alignItems: "center", gap: 6, outline: "none",
    }}>
      <DoubleChevron up={allOpen} />
      {allOpen ? "Collapse all" : "Expand all"}
    </TapArea>
  );
}

const ACCENT_COLORS = [
  { pos: "#34c759", neg: "#ff453a", glow: "rgba(52,199,89,0.5)" },
  { pos: "#0a84ff", neg: "#ff9f0a", glow: "rgba(10,132,255,0.5)" },
  { pos: "#bf5af2", neg: "#ff453a", glow: "rgba(191,90,242,0.5)" },
  { pos: "#ff9f0a", neg: "#ff453a", glow: "rgba(255,159,10,0.5)" },
  { pos: "#5ac8fa", neg: "#ff6b6b", glow: "rgba(90,200,250,0.5)" },
  { pos: "#ff375f", neg: "#ff9f0a", glow: "rgba(255,55,95,0.5)" },
];

const CAT_COLORS = ["#0a84ff","#34c759","#ff9f0a","#bf5af2","#ff453a","#5ac8fa"];

let nextId = 2;
let nextCatId = 1;

const defaultCounters = [
  { id: 1, name: "Counter 1", count: 0, step: 1, stepDown: 1, colorIdx: 0, category: null, notes: "" },
];

function TouchButton({ onAction, style, children, ...rest }) {
  const didTouch = useRef(false);
  const handleTouchStart = () => { didTouch.current = true; };
  const handleTouchEnd = (e) => { e.preventDefault(); onAction(); };
  const handleMouseUp = () => { if (!didTouch.current) onAction(); };
  return (
    <button
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseUp={handleMouseUp}
      style={{ WebkitTapHighlightColor: "transparent", cursor: "pointer", border: "none", outline: "none", ...style }}
      {...rest}
    >{children}</button>
  );
}

function StepSection({ label, value, inputVal, setInputVal }) {
  const presets = [1, 5, 10, 25, 100];
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{label}</label>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
        {presets.map(p => (
          <TouchButton key={p} onAction={() => setInputVal(String(p))} style={{
            padding: "4px 10px", borderRadius: 16, fontSize: 12, fontWeight: 500,
            background: parseFloat(inputVal) === p ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.07)",
            color: parseFloat(inputVal) === p ? "#fff" : "rgba(255,255,255,0.4)",
          }}>{p}</TouchButton>
        ))}
      </div>
      <input type="number" min="0.01" value={inputVal}
        onChange={e => setInputVal(e.target.value)}
        onFocus={e => e.target.select()}
        placeholder="Custom…"
        style={{
          width: "100%", boxSizing: "border-box",
          background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8, padding: "6px 10px", color: "#fff", fontSize: 13,
          outline: "none", fontFamily: "inherit",
        }}
      />
    </div>
  );
}

function ResetButton({ count, onReset }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const tap = () => {
    if (count === 0) return;
    if (!armed) {
      setArmed(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setArmed(false), 3000);
      return;
    }
    clearTimeout(timer.current);
    setArmed(false);
    onReset();
  };

  const isZero = count === 0;
  return (
    <TouchButton onAction={tap} disabled={isZero} style={{
      width: "100%", padding: "10px", borderRadius: 10, marginBottom: 8,
      fontSize: 13, fontWeight: armed ? 700 : 500, fontFamily: "inherit",
      background: armed ? "#ff9f0a" : "rgba(255,255,255,0.08)",
      color: armed ? "#000" : isZero ? "rgba(255,255,255,0.3)" : "#fff",
      transition: "background 0.15s",
      cursor: isZero ? "default" : "pointer",
    }}>
      {isZero ? "Count is 0" : armed ? "Tap again to reset" : `↺  Reset count to 0  (now ${count.toLocaleString()})`}
    </TouchButton>
  );
}

function SettingsPanel({ counter, categories, onSave, onDelete, onReset, onClose }) {
  const [inputName, setInputName] = useState(counter.name);
  const [inputNotes, setInputNotes] = useState(counter.notes ?? "");
  const [draftCategory, setDraftCategory] = useState(counter.category);
  const [draftColorIdx, setDraftColorIdx] = useState(counter.colorIdx);
  const [inputStep, setInputStep] = useState(String(counter.step));
  const [inputStepDown, setInputStepDown] = useState(String(counter.stepDown));

  const handleSave = () => {
    const name = inputName.trim() || counter.name;
    const step = Math.max(0.01, parseFloat(inputStep) || counter.step);
    const stepDown = Math.max(0.01, parseFloat(inputStepDown) || counter.stepDown);
    onSave({ name, notes: inputNotes, category: draftCategory, colorIdx: draftColorIdx, step, stepDown });
  };

  /* Lock the page behind the modal and restore the exact scroll position on close. */
  useEffect(() => {
    const scrollY = window.scrollY;
    const body = document.body;
    const prevCss = body.style.cssText;
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    return () => {
      body.style.cssText = prevCss;
      window.scrollTo(0, scrollY);
    };
  }, []);

  /* Portalled to <body>: the card's backdrop-filter would otherwise make it the
     containing block for position:fixed, and its overflow:hidden would clip us. */
  return createPortal(
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16, boxSizing: "border-box",
      fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
      color: "#fff",
    }}>
      {/* Backdrop — tap to close */}
      <TouchButton onAction={onClose} aria-label="Close settings" style={{
        position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
        display: "block", padding: 0, borderRadius: 0,
        background: "rgba(0,0,0,0.62)",
        backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
      }} />

      {/* Panel */}
      <div role="dialog" aria-modal="true" aria-label={`${counter.name} settings`} style={{
        position: "relative",
        width: "100%", maxWidth: 420,
        maxHeight: "85vh", overflowY: "auto", WebkitOverflowScrolling: "touch",
        background: "rgba(22,32,48,0.82)",
        backdropFilter: "blur(30px)", WebkitBackdropFilter: "blur(30px)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 22,
        boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
        padding: 16, boxSizing: "border-box",
      }}>
      {/* Name */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Name</label>
        <input
          value={inputName}
          onChange={e => setInputName(e.target.value)}
          onFocus={e => e.target.select()}
          onKeyDown={e => e.key === "Enter" && handleSave()}
          style={{
            width: "100%", boxSizing: "border-box",
            background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8, padding: "7px 10px", color: "#fff", fontSize: 13,
            outline: "none", fontFamily: "inherit", display: "block",
          }}
        />
      </div>

      {/* Notes */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Notes</label>
        <textarea
          value={inputNotes}
          onChange={e => setInputNotes(e.target.value)}
          rows={4}
          style={{
            width: "100%", boxSizing: "border-box",
            background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8, padding: "7px 10px", color: "#fff", fontSize: 13,
            outline: "none", fontFamily: "inherit", display: "block",
            resize: "vertical",
          }}
        />
      </div>

      {/* Group */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Group</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <TouchButton onAction={() => setDraftCategory(null)} style={{
            padding: "5px 12px", borderRadius: 16, fontSize: 12, fontWeight: 500,
            background: draftCategory === null ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.07)",
            color: draftCategory === null ? "#fff" : "rgba(255,255,255,0.4)",
          }}>None</TouchButton>
          {categories.map(cat => (
            <TouchButton key={cat.id} onAction={() => setDraftCategory(cat.id)} style={{
              padding: "5px 12px", borderRadius: 16, fontSize: 12, fontWeight: 500,
              background: draftCategory === cat.id ? cat.color + "33" : "rgba(255,255,255,0.07)",
              color: draftCategory === cat.id ? cat.color : "rgba(255,255,255,0.4)",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: cat.color, display: "inline-block", flexShrink: 0 }} />
              {cat.name}
            </TouchButton>
          ))}
          {categories.length === 0 && (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>No groups yet</span>
          )}
        </div>
      </div>

      {/* Reset (two-tap confirm) */}
      <ResetButton count={counter.count} onReset={onReset} />

      {/* Delete / Save */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <TouchButton onAction={onDelete} style={{
          flex: 1, padding: "10px", borderRadius: 10,
          background: "rgba(255,69,58,0.15)", color: "#ff453a",
          fontSize: 13, fontWeight: 500, fontFamily: "inherit",
        }}>Delete</TouchButton>
        <TouchButton onAction={handleSave} style={{
          flex: 2, padding: "10px", borderRadius: 10,
          background: "#34c759", color: "#fff",
          fontSize: 14, fontWeight: 700, fontFamily: "inherit",
        }}>Save</TouchButton>
      </div>

      <StepSection label="+ Step (up)" value={counter.step} inputVal={inputStep} setInputVal={setInputStep} />
      <StepSection label="− Step (down)" value={counter.stepDown} inputVal={inputStepDown} setInputVal={setInputStepDown} />

      {/* Color */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Color</label>
        <div style={{ display: "flex", gap: 10 }}>
          {ACCENT_COLORS.map((c, i) => (
            <TouchButton key={i} onAction={() => setDraftColorIdx(i)} style={{
              width: 24, height: 24, borderRadius: "50%", padding: 0,
              background: c.pos,
              border: draftColorIdx === i ? "2.5px solid #fff" : "2.5px solid transparent",
              boxShadow: draftColorIdx === i ? `0 0 8px ${c.glow}` : "none",
              transition: "border 0.15s, box-shadow 0.15s",
            }} />
          ))}
        </div>
      </div>
      </div>
    </div>,
    document.body
  );
}

/* iOS: no text selection, no callout/magnifier while holding a card. */
const NO_SELECT = {
  userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none",
  WebkitTapHighlightColor: "transparent",
};

/* The card face. Purely visual apart from + / − and the open/collapse taps:
   it never opens settings on its own (that is the hold, handled by dnd-kit).
   Collapsed it is a thin 44px line (name + count); expanded it is the full card. */
const SLIDE = "0.28s ease";

function CounterCardView({ counter, expanded, onToggle, onFire, flash }) {
  const color = ACCENT_COLORS[counter.colorIdx % ACCENT_COLORS.length];
  const stepLabel = counter.step === counter.stepDown
    ? `step ${counter.step}`
    : `+${counter.step} / −${counter.stepDown}`;
  const countColor = counter.count > 0 ? color.pos : counter.count < 0 ? color.neg : "#fff";
  const toggle = () => onToggle?.();
  const btn = {
    width: 58, height: 58, borderRadius: 16, flexShrink: 0,
    color: "#fff", fontSize: 32, fontWeight: 300,
    display: "flex", alignItems: "center", justifyContent: "center",
  };
  const slot = (open) => ({
    display: "grid", gridTemplateRows: open ? "1fr" : "0fr",
    opacity: open ? 1 : 0,
    transition: `grid-template-rows ${SLIDE}, opacity ${SLIDE}`,
  });

  return (
    <div style={{
      borderRadius: expanded ? 20 : 14,
      background: flash === "pos" ? "rgba(52,199,89,0.08)" : flash === "neg" ? "rgba(255,69,58,0.08)" : "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.1)",
      backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
      boxShadow: expanded ? "0 8px 32px rgba(0,0,0,0.3)" : "0 8px 32px rgba(0,0,0,0)",
      transition: `background 0.18s, border-radius ${SLIDE}, box-shadow ${SLIDE}`,
      boxSizing: "border-box", overflow: "hidden",
    }}>
      {/* Thin line (collapsed) */}
      <div style={slot(!expanded)} inert={expanded || undefined}>
        <div style={{ overflow: "hidden", minHeight: 0 }}>
          <TapArea onTap={toggle} aria-label={`Open ${counter.name}`} aria-expanded={false} style={{
            height: 44, padding: "0 14px", boxSizing: "border-box",
            display: "flex", alignItems: "center", gap: 10, outline: "none",
          }}>
            <span style={{
              flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: "#fff", textAlign: "left",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{counter.name}</span>
            <span style={{
              fontSize: 20, fontVariantNumeric: "tabular-nums", color: countColor,
              transition: "color 0.2s", flexShrink: 0,
            }}>{counter.count.toLocaleString()}</span>
            <Chevron />
          </TapArea>
        </div>
      </div>

      {/* Full card (expanded) */}
      <div style={slot(expanded)} inert={!expanded || undefined}>
        <div style={{ overflow: "hidden", minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 10 }}>
            <TouchButton data-no-dnd="" aria-label={`Decrease ${counter.name}`} onAction={() => onFire?.(-1)} style={{
              ...btn,
              background: "linear-gradient(145deg, #ff453a, #e53935)",
              boxShadow: "0 4px 14px rgba(255,69,58,0.45)",
            }}>−</TouchButton>

            <TapArea onTap={toggle} aria-label={`Collapse ${counter.name}`} aria-expanded={true} style={{
              flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center",
              outline: "none",
            }}>
              <div style={{
                fontSize: 16, fontWeight: 700, color: "#fff", maxWidth: "100%",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{counter.name}</span>
                <Chevron up size={10} />
              </div>
              <div style={{
                fontSize: 34, fontWeight: 400, letterSpacing: "-0.03em", lineHeight: 1.1,
                color: countColor, fontVariantNumeric: "tabular-nums", transition: "color 0.2s",
              }}>{counter.count.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", letterSpacing: "0.03em" }}>{stepLabel}</div>
            </TapArea>

            <TouchButton data-no-dnd="" aria-label={`Increase ${counter.name}`} onAction={() => onFire?.(1)} style={{
              ...btn,
              background: `linear-gradient(145deg, ${color.pos}, ${color.pos}bb)`,
              boxShadow: `0 4px 14px ${color.glow}`,
            }}>+</TouchButton>
          </div>
        </div>
      </div>
    </div>
  );
}

/* A card in the list: sortable. While it is being held/dragged it becomes the
   green dashed drop slot; the lifted copy is drawn by <DragOverlay>. */
function SortableCounterCard({ counter, expanded, onToggle, onUpdate, dimmed }) {
  const [flash, setFlash] = useState(null);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: counter.id });

  const fire = useCallback((dir) => {
    const amount = dir > 0 ? counter.step : counter.stepDown;
    onUpdate(counter.id, { count: counter.count + dir * amount });
    setFlash(dir > 0 ? "pos" : "neg");
    setTimeout(() => setFlash(null), 180);
  }, [counter, onUpdate]);

  const toggle = useCallback(() => onToggle(counter.id), [onToggle, counter.id]);

  return (
    <div
      ref={setNodeRef}
      data-counter-id={counter.id}
      {...attributes}
      {...listeners}
      onContextMenu={e => e.preventDefault()}
      style={{
        ...NO_SELECT,
        position: "relative",
        transform: CSS.Translate.toString(transform),
        transition: [transition, "opacity 0.15s"].filter(Boolean).join(", "),
        opacity: dimmed ? 0.55 : 1,
        outline: "none",
      }}
    >
      <div style={{ visibility: isDragging ? "hidden" : "visible" }}>
        <CounterCardView counter={counter} expanded={expanded} onToggle={toggle} onFire={fire} flash={flash} />
      </div>
      {isDragging && (
        <div style={{
          position: "absolute", inset: 0, borderRadius: expanded ? 20 : 14,
          border: `2px dashed ${LIFT_GREEN}`, background: "rgba(61,213,106,0.07)",
          boxSizing: "border-box",
        }} />
      )}
    </div>
  );
}

/* The lifted card that follows the finger: a thin line or the full card,
   matching the state the counter is in. */
function LiftedCard({ counter, expanded }) {
  return (
    <div style={{ ...NO_SELECT, position: "relative", transform: "scale(1.03)" }}>
      <div style={{
        position: "absolute", left: "50%", top: -30, transform: "translateX(-50%)",
        background: LIFT_GREEN, color: "#04210e", whiteSpace: "nowrap",
        fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 999,
        boxShadow: "0 4px 12px rgba(0,0,0,0.4)", pointerEvents: "none",
      }}>Let go to edit · move to reorder</div>
      <div style={{
        borderRadius: expanded ? 20 : 14, border: `2px solid ${LIFT_GREEN}`,
        boxShadow: "0 18px 50px rgba(0,0,0,0.7), 0 0 0 1px rgba(61,213,106,0.25)",
        background: "rgba(22,32,48,0.92)", overflow: "hidden",
      }}>
        <CounterCardView counter={counter} expanded={expanded} />
      </div>
    </div>
  );
}

/* One group in the open Groups panel: [dot] [name input ✎] [count] [×].
   The name is edited locally and committed on blur / Enter; Escape reverts. */
function CategoryRow({ cat, count, onUpdate, onDelete }) {
  const [draft, setDraft] = useState(cat.name);
  const [focused, setFocused] = useState(false);
  const skipCommit = useRef(false);

  // Follow outside renames while the field is not being edited.
  useEffect(() => { if (!focused) setDraft(cat.name); }, [cat.name, focused]);

  const commit = () => {
    const name = draft.trim();
    if (!name) { setDraft(cat.name); return; }
    setDraft(name);
    if (name !== cat.name) onUpdate(cat.id, { name });
  };

  const cycleColor = () => {
    const i = CAT_COLORS.indexOf(cat.color);
    onUpdate(cat.id, { color: CAT_COLORS[(i + 1) % CAT_COLORS.length] });
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, minHeight: 44 }}>
      <TapArea as="button" onTap={cycleColor} aria-label={`Change color of ${cat.name}`} style={{
        width: 36, height: 44, padding: 0, flexShrink: 0,
        background: "none", border: "none", outline: "none",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{
          width: 12, height: 12, borderRadius: "50%", background: cat.color,
          display: "block", transition: "background 0.15s",
        }} />
      </TapArea>
      <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
        <input
          value={draft}
          aria-label="Group name"
          onChange={e => setDraft(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (skipCommit.current) { skipCommit.current = false; return; }
            commit();
          }}
          onKeyDown={e => {
            if (e.key === "Enter") e.currentTarget.blur();
            else if (e.key === "Escape") { skipCommit.current = true; setDraft(cat.name); e.currentTarget.blur(); }
          }}
          style={{
            width: "100%", boxSizing: "border-box", height: 36,
            padding: "0 30px 0 8px", borderRadius: 8,
            background: focused ? "rgba(255,255,255,0.08)" : "transparent",
            border: `1px solid ${focused ? "rgba(255,255,255,0.25)" : "transparent"}`,
            color: "#fff", fontSize: 15, fontWeight: 500,
            outline: "none", fontFamily: "inherit",
            transition: "background 0.15s, border-color 0.15s",
          }}
        />
        <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true" style={{
          position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)",
          pointerEvents: "none",
        }}>
          <path d="M9.5 2.5 11.5 4.5 5 11H3V9Z M8.2 3.8l2 2" fill="none" stroke="rgba(255,255,255,0.4)"
            strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <span style={{
        fontSize: 12, color: "rgba(255,255,255,0.4)", fontVariantNumeric: "tabular-nums",
        minWidth: 18, textAlign: "right", flexShrink: 0,
      }}>{count}</span>
      <TouchButton onAction={() => onDelete(cat.id)} aria-label={`Delete group ${cat.name}`} style={{
        background: "none", color: "rgba(255,69,58,0.7)", fontSize: 18, padding: "0 4px", lineHeight: 1,
        minWidth: 28, height: 44, flexShrink: 0,
      }}>×</TouchButton>
    </div>
  );
}

function CategoryManager({ categories, counts, onAdd, onUpdate, onDelete }) {
  const [input, setInput] = useState("");
  const [colorIdx, setColorIdx] = useState(0);
  const [open, setOpen] = useState(false);

  const add = () => {
    const name = input.trim();
    if (!name) return;
    onAdd(name, CAT_COLORS[colorIdx % CAT_COLORS.length]);
    setInput("");
    setColorIdx(c => (c + 1) % CAT_COLORS.length);
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <TouchButton onAction={() => setOpen(o => !o)} style={{
        background: "none", padding: 0,
        color: "rgba(255,255,255,0.35)", fontSize: 11, fontWeight: 600,
        letterSpacing: "0.08em", textTransform: "uppercase",
        display: "flex", alignItems: "center", gap: 5,
      }}>
        <span style={{ fontSize: 14, display: "inline-block", transition: "transform 0.2s", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>›</span>
        Groups
      </TouchButton>

      {open && (
        <div style={{
          marginTop: 10,
          background: "rgba(255,255,255,0.04)", borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.08)", padding: "12px",
          boxSizing: "border-box",
        }}>
          {categories.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>
                Tap a name to rename · tap the dot to change color
              </div>
              <div style={{ marginBottom: 10, display: "flex", flexDirection: "column", gap: 2 }}>
                {categories.map(cat => (
                  <CategoryRow key={cat.id} cat={cat} count={counts[cat.id] ?? 0} onUpdate={onUpdate} onDelete={onDelete} />
                ))}
              </div>
            </>
          )}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              {CAT_COLORS.map((c, i) => (
                <TouchButton key={i} onAction={() => setColorIdx(i)} style={{
                  width: 18, height: 18, borderRadius: "50%", padding: 0,
                  background: c,
                  border: colorIdx === i ? "2px solid #fff" : "2px solid transparent",
                }} />
              ))}
            </div>
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && add()}
              placeholder="New category…"
              style={{
                flex: 1, minWidth: 0,
                background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8, padding: "5px 10px", color: "#fff", fontSize: 12,
                outline: "none", fontFamily: "inherit", boxSizing: "border-box",
              }}
            />
            <TouchButton onAction={add} style={{
              background: "#34c759", borderRadius: 8, flexShrink: 0,
              color: "#fff", fontSize: 12, fontWeight: 700, padding: "5px 12px",
              fontFamily: "inherit",
            }}>Add</TouchButton>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [counters, setCounters] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("counterapp_counters"));
      if (saved && saved.length) {
        const coerced = saved.map(c => ({
          ...c,
          id: Number(c.id),
          category: c.category != null ? Number(c.category) : null,
        }));
        nextId = Math.max(...coerced.map(c => c.id)) + 1;
        return coerced;
      }
    } catch {}
    return defaultCounters;
  });

  const [categories, setCategories] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("counterapp_categories"));
      if (saved && saved.length) {
        const coerced = saved.map(c => ({ ...c, id: Number(c.id) }));
        nextCatId = Math.max(...coerced.map(c => c.id)) + 1;
        return coerced;
      }
    } catch {}
    return [];
  });

  /* Which cards are open. Saved separately so the counters key is untouched.
     First run (no saved key): every existing card starts open, like before. */
  const [expandedIds, setExpandedIds] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("counterapp_expanded"));
      if (Array.isArray(saved)) {
        const live = new Set(counters.map(c => c.id));
        return new Set(saved.map(Number).filter(id => live.has(id)));
      }
    } catch {}
    return new Set(counters.map(c => c.id));
  });

  const [activeFilter, setActiveFilter] = useState("all");

  useEffect(() => {
    localStorage.setItem("counterapp_counters", JSON.stringify(counters));
  }, [counters]);

  useEffect(() => {
    localStorage.setItem("counterapp_categories", JSON.stringify(categories));
  }, [categories]);

  useEffect(() => {
    localStorage.setItem("counterapp_expanded", JSON.stringify([...expandedIds]));
  }, [expandedIds]);

  const updateCounter = useCallback((id, changes) => {
    setCounters(cs => cs.map(c => c.id === id ? { ...c, ...changes } : c));
  }, []);

  const deleteCounter = useCallback((id) => {
    setCounters(cs => cs.filter(c => c.id !== id));
    setExpandedIds(s => { if (!s.has(id)) return s; const n = new Set(s); n.delete(id); return n; });
  }, []);

  const toggleExpanded = useCallback((id) => {
    setExpandedIds(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  const setManyExpanded = (ids, open) => {
    setExpandedIds(s => {
      const n = new Set(s);
      ids.forEach(id => (open ? n.add(id) : n.delete(id)));
      return n;
    });
  };

  const addCounter = () => {
    const id = nextId++;
    setCounters(cs => [...cs, {
      id, name: `Counter ${id}`, count: 0, step: 1, stepDown: 1, colorIdx: 0, notes: "",
      category: activeFilter !== "all" ? activeFilter : null,
    }]);
    setExpandedIds(s => new Set(s).add(id));
  };

  const addCategory = (name, color) => {
    const id = nextCatId++;
    setCategories(cs => [...cs, { id, name, color }]);
  };

  const updateCategory = useCallback((id, changes) => {
    setCategories(cs => cs.map(c => c.id === id ? { ...c, ...changes } : c));
  }, []);

  const deleteCategory = (id) => {
    setCategories(cs => cs.filter(c => c.id !== id));
    setCounters(cs => cs.map(c => c.category === id ? { ...c, category: null } : c));
    if (activeFilter === id) setActiveFilter("all");
  };

  /* A counter's section: its group if that group exists, else "No group" (null).
     Old data with a category id that no longer exists lands in "No group". */
  const catIds = new Set(categories.map(c => c.id));
  const groupOf = (c) => (c && c.category != null && catIds.has(c.category) ? c.category : null);

  const filteredCounters = activeFilter === "all"
    ? counters
    : counters.filter(c => groupOf(c) === activeFilter);

  const groupCounts = {};
  counters.forEach(c => { const g = groupOf(c); if (g != null) groupCounts[g] = (groupCounts[g] ?? 0) + 1; });

  /* Sections, in `categories` order, then "No group". Empty ones are hidden. */
  const sections = [];
  if (categories.length > 0) {
    const shown = activeFilter === "all" ? categories : categories.filter(c => c.id === activeFilter);
    shown.forEach(cat => sections.push({
      key: cat.id, name: cat.name, color: cat.color,
      items: counters.filter(c => groupOf(c) === cat.id),
    }));
    if (activeFilter === "all") sections.push({
      key: "none", name: "No group", color: "rgba(255,255,255,0.35)", grey: true,
      items: counters.filter(c => groupOf(c) === null),
    });
  }
  const visibleSections = sections.filter(s => s.items.length > 0);

  /* ---- Hold to edit, hold and drag to reorder ---- */
  const [activeId, setActiveId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const movedRef = useRef(false);

  // Before the hold completes, moving more than the tolerance cancels it and the page scrolls.
  const holdConstraint = { delay: HOLD_MS, tolerance: MOVE_TOLERANCE_PX };
  const sensors = useSensors(
    useSensor(HoldTouchSensor, { activationConstraint: holdConstraint }),
    useSensor(HoldMouseSensor, { activationConstraint: holdConstraint }),
  );

  const [hintViews] = useState(() => {
    const n = Number(localStorage.getItem("counterapp_hint_views")) || 0;
    localStorage.setItem("counterapp_hint_views", String(n + 1));
    return n;
  });
  const [hintDismissed, setHintDismissed] = useState(false);

  const counterById = (id) => counters.find(c => c.id === id);

  /* Only cards in the dragged card's own section are drop targets, so other
     sections never shift while dragging. */
  const collisionDetection = (args) => {
    const g = groupOf(counterById(args.active.id));
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(d => {
        const c = counterById(d.id);
        return c && groupOf(c) === g;
      }),
    });
  };

  const handleDragStart = ({ active }) => {
    armDndGuard();
    movedRef.current = false;
    setActiveId(active.id);
  };

  const handleDragMove = ({ delta }) => {
    if (Math.hypot(delta.x, delta.y) >= MOVE_TOLERANCE_PX) movedRef.current = true;
  };

  const handleDragEnd = ({ active, over }) => {
    releaseDndGuard();
    setActiveId(null);
    const moved = movedRef.current;
    movedRef.current = false;

    if (!over || active.id === over.id) {
      // Held and let go without really moving: open settings.
      if (!moved) {
        setEditingId(active.id);
        setHintDismissed(true);
        localStorage.setItem("counterapp_hint_views", "99");
      }
      return;
    }

    setHintDismissed(true);
    localStorage.setItem("counterapp_hint_views", "99");
    setCounters(cs => {
      const g = groupOf(cs.find(c => c.id === active.id));
      if (groupOf(cs.find(c => c.id === over.id)) !== g) return cs; // other group: ignore
      // Reorder within the group; the group keeps its slots in the global list.
      const members = cs.filter(c => groupOf(c) === g);
      const from = members.findIndex(c => c.id === active.id);
      const to = members.findIndex(c => c.id === over.id);
      if (from < 0 || to < 0) return cs;
      const reordered = arrayMove(members, from, to);
      let i = 0;
      return cs.map(c => (groupOf(c) === g ? reordered[i++] : c));
    });
  };

  const handleDragCancel = () => {
    releaseDndGuard();
    setActiveId(null);
    movedRef.current = false;
  };

  const activeCounter = counters.find(c => c.id === activeId) ?? null;
  const editingCounter = counters.find(c => c.id === editingId) ?? null;
  const showHint = !hintDismissed && hintViews < 3 && filteredCounters.length > 0;

  const allOpen = (list) => list.length > 0 && list.every(c => expandedIds.has(c.id));
  const toggleAll = (list) => setManyExpanded(list.map(c => c.id), !allOpen(list));

  const renderCards = (list) => (
    <SortableContext items={list.map(c => c.id)} strategy={verticalListSortingStrategy}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {list.map(counter => (
          <SortableCounterCard
            key={counter.id}
            counter={counter}
            expanded={expandedIds.has(counter.id)}
            onToggle={toggleExpanded}
            onUpdate={updateCounter}
            dimmed={activeId != null && activeId !== counter.id}
          />
        ))}
      </div>
    </SortableContext>
  );

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(ellipse at 40% 10%, #162030 0%, #080d14 100%)",
      fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
      color: "#fff", overflowY: "auto",
    }}>
      <div style={{ maxWidth: 420, margin: "0 auto", padding: "28px 16px 40px", boxSizing: "border-box" }}>
        <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 200, letterSpacing: "-0.03em" }}>Counters</h1>
          <TouchButton onAction={addCounter} style={{
            background: "#34c759", color: "#fff", fontSize: 22, fontWeight: 300,
            width: 36, height: 36, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 16px rgba(52,199,89,0.4)", flexShrink: 0,
          }}>+</TouchButton>
        </div>

        <CategoryManager
          categories={categories}
          counts={groupCounts}
          onAdd={addCategory}
          onUpdate={updateCategory}
          onDelete={deleteCategory}
        />


        {categories.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
            <TouchButton onAction={() => setActiveFilter("all")} style={{
              padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500,
              background: activeFilter === "all" ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.07)",
              color: activeFilter === "all" ? "#fff" : "rgba(255,255,255,0.4)",
            }}>All</TouchButton>
            {categories.map(cat => (
              <TouchButton key={cat.id} onAction={() => setActiveFilter(cat.id)} style={{
                padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500,
                background: activeFilter === cat.id ? cat.color + "33" : "rgba(255,255,255,0.07)",
                color: activeFilter === cat.id ? cat.color : "rgba(255,255,255,0.4)",
                display: "flex", alignItems: "center", gap: 5,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: cat.color, display: "inline-block" }} />
                {cat.name}
              </TouchButton>
            ))}
          </div>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          modifiers={[verticalOnly]}
          autoScroll={{ threshold: { x: 0, y: 0.15 }, acceleration: 12 }}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          {categories.length === 0 ? (
            counters.length > 0 && (
              <>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                  <ExpandAllPill allOpen={allOpen(counters)} onTap={() => toggleAll(counters)} />
                </div>
                {renderCards(counters)}
              </>
            )
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              {visibleSections.map(sec => (
                <section key={sec.key}>
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                    paddingBottom: 8, marginBottom: 10,
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                  }}>
                    <h2 style={{
                      margin: 0, minWidth: 0, display: "flex", alignItems: "center", gap: 8,
                      fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                      color: sec.color,
                    }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: sec.color, flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sec.name}</span>
                      <span style={{ fontWeight: 500, color: "rgba(255,255,255,0.4)", letterSpacing: "0.04em", flexShrink: 0 }}>
                        {sec.items.length}
                      </span>
                    </h2>
                    <ExpandAllPill allOpen={allOpen(sec.items)} onTap={() => toggleAll(sec.items)} />
                  </div>
                  {renderCards(sec.items)}
                </section>
              ))}
            </div>
          )}
          {createPortal(
            <DragOverlay modifiers={[verticalOnly]} dropAnimation={{ duration: 180, easing: "ease-out" }} style={{ zIndex: 900 }}>
              {activeCounter && <LiftedCard counter={activeCounter} expanded={expandedIds.has(activeCounter.id)} />}
            </DragOverlay>,
            document.body
          )}
        </DndContext>

        {showHint && (
          <div style={{ textAlign: "center", marginTop: 18, fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
            Tap to open · hold to edit or move
          </div>
        )}

        {filteredCounters.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.2)", fontSize: 14 }}>
            {activeFilter === "all" ? "No counters yet." : "No counters in this category."} Add one below.
          </div>
        )}
      </div>

      {/* Settings — full-screen modal, opened by hold + release */}
      {editingCounter && (
        <SettingsPanel
          key={editingCounter.id}
          counter={editingCounter}
          categories={categories}
          onSave={(changes) => { updateCounter(editingCounter.id, changes); setEditingId(null); }}
          onDelete={() => { setEditingId(null); deleteCounter(editingCounter.id); }}
          onReset={() => updateCounter(editingCounter.id, { count: 0 })}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}
