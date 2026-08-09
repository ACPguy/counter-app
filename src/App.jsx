import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

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

function SettingsPanel({ counter, categories, onSave, onDelete, onClose }) {
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

function CounterCard({ counter, categories, onUpdate, onDelete }) {
  const [showSettings, setShowSettings] = useState(false);
  const [flash, setFlash] = useState(null);
  const color = ACCENT_COLORS[counter.colorIdx % ACCENT_COLORS.length];
  const cat = categories.find(c => c.id === counter.category);

  const fire = useCallback((dir) => {
    const amount = dir > 0 ? counter.step : counter.stepDown;
    onUpdate(counter.id, { count: counter.count + dir * amount });
    setFlash(dir > 0 ? "pos" : "neg");
    setTimeout(() => setFlash(null), 180);
  }, [counter, onUpdate]);

  const reset = () => onUpdate(counter.id, { count: 0 });

  const handleSave = (changes) => {
    onUpdate(counter.id, changes);
    setShowSettings(false);
  };

  const handleDelete = () => {
    setShowSettings(false);
    onDelete(counter.id);
  };

  const stepBadge = counter.step === counter.stepDown ? `×${counter.step}` : `+${counter.step} / −${counter.stepDown}`;
  const countColor = counter.count > 0 ? color.pos : counter.count < 0 ? color.neg : "#fff";

  return (
    <div style={{
      borderRadius: 22,
      background: flash === "pos" ? "rgba(52,199,89,0.08)" : flash === "neg" ? "rgba(255,69,58,0.08)" : "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.1)",
      backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
      boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
      overflow: "hidden", transition: "background 0.18s",
    }}>

      {/* Header bar — always rendered, always tappable; blank when there's no group */}
      <TouchButton onAction={() => setShowSettings(true)} aria-label={`Settings for ${counter.name}`} style={{
        width: "100%", height: 21, boxSizing: "border-box",
        display: "flex", alignItems: "center", gap: 6,
        padding: "0 14px", borderRadius: 0, textAlign: "left",
        fontFamily: "inherit",
        background: cat ? cat.color + "22" : "rgba(255,255,255,0.05)",
        borderBottom: `1px solid ${cat ? cat.color + "33" : "rgba(255,255,255,0.08)"}`,
      }}>
        {cat && (
          <>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: cat.color, display: "inline-block", flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: cat.color, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase" }}>{cat.name}</span>
          </>
        )}
      </TouchButton>

      {/* Main row */}
      <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", gap: 10 }}>
        {/* − */}
        <TouchButton onAction={() => fire(-1)} style={{
          width: 46, height: 46, borderRadius: 12,
          background: "linear-gradient(145deg, #ff453a, #e53935)", color: "#fff", fontSize: 28, fontWeight: 300,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 14px rgba(255,69,58,0.45)", flexShrink: 0,
        }}>−</TouchButton>

        {/* Center */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 }}>
          <div style={{
            fontSize: 15, color: "#fff", fontWeight: 700, letterSpacing: "0.05em", marginBottom: 4,
            width: "100%", textAlign: "center",
          }}>{counter.name}</div>

          <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
            <TouchButton onAction={reset} style={{
              background: "none", color: "rgba(255,255,255,0.25)", fontSize: 20, padding: "0 2px",
              lineHeight: 1, display: "flex", alignItems: "center", flexShrink: 0,
            }}>↺</TouchButton>
            <div style={{
              flex: 1, textAlign: "center",
              fontSize: 32, fontWeight: 400, letterSpacing: "-0.03em",
              color: countColor, lineHeight: 1,
              fontVariantNumeric: "tabular-nums", transition: "color 0.2s",
            }}>{counter.count.toLocaleString()}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", letterSpacing: "0.03em" }}>{stepBadge}</span>
            </div>
          </div>
        </div>

        {/* + */}
        <TouchButton onAction={() => fire(1)} style={{
          width: 46, height: 46, borderRadius: 12,
          background: `linear-gradient(145deg, ${color.pos}, ${color.pos}bb)`, color: "#fff", fontSize: 28, fontWeight: 300,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 4px 14px ${color.glow}`, flexShrink: 0,
        }}>+</TouchButton>
      </div>

      {/* Settings — full-screen modal, portalled out of this card */}
      {showSettings && (
        <SettingsPanel
          counter={counter}
          categories={categories}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

function CategoryManager({ categories, onAdd, onDelete }) {
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
            <div style={{ marginBottom: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              {categories.map(cat => (
                <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: cat.color, display: "inline-block", flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, color: "#fff", fontWeight: 500 }}>{cat.name}</span>
                  <TouchButton onAction={() => onDelete(cat.id)} style={{
                    background: "none", color: "rgba(255,69,58,0.7)", fontSize: 18, padding: "0 4px", lineHeight: 1,
                  }}>×</TouchButton>
                </div>
              ))}
            </div>
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

  const [activeFilter, setActiveFilter] = useState("all");

  useEffect(() => {
    localStorage.setItem("counterapp_counters", JSON.stringify(counters));
  }, [counters]);

  useEffect(() => {
    localStorage.setItem("counterapp_categories", JSON.stringify(categories));
  }, [categories]);

  const updateCounter = useCallback((id, changes) => {
    setCounters(cs => cs.map(c => c.id === id ? { ...c, ...changes } : c));
  }, []);

  const deleteCounter = useCallback((id) => {
    setCounters(cs => cs.filter(c => c.id !== id));
  }, []);

  const addCounter = () => {
    const id = nextId++;
    setCounters(cs => [...cs, {
      id, name: `Counter ${id}`, count: 0, step: 1, stepDown: 1, colorIdx: 0, notes: "",
      category: activeFilter !== "all" ? activeFilter : null,
    }]);
  };

  const addCategory = (name, color) => {
    const id = nextCatId++;
    setCategories(cs => [...cs, { id, name, color }]);
  };

  const deleteCategory = (id) => {
    setCategories(cs => cs.filter(c => c.id !== id));
    setCounters(cs => cs.map(c => c.category === id ? { ...c, category: null } : c));
    if (activeFilter === id) setActiveFilter("all");
  };

  const filteredCounters = activeFilter === "all"
    ? counters
    : counters.filter(c => c.category === activeFilter);

  const total = filteredCounters.reduce((sum, c) => sum + c.count, 0);

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

        <CategoryManager categories={categories} onAdd={addCategory} onDelete={deleteCategory} />


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

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredCounters.map(counter => (
            <CounterCard key={counter.id} counter={counter} categories={categories} onUpdate={updateCounter} onDelete={deleteCounter} />
          ))}
        </div>

        {filteredCounters.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.2)", fontSize: 14 }}>
            {activeFilter === "all" ? "No counters yet." : "No counters in this category."} Add one below.
          </div>
        )}
      </div>

    </div>
  );
}