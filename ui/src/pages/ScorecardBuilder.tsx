import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "@/lib/router";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X, Plus, Search, Save, ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import { PageSkeleton } from "../components/PageSkeleton";

const CATEGORY_COLORS: Record<string, string> = {
  sales: "#22c55e", shipping: "#3b82f6", operations: "#f59e0b", finance: "#8b5cf6",
  support: "#f97316", breeding: "#ec4899", production: "#14b8a6", wholesale: "#6366f1",
  leads: "#84cc16", inbound: "#06b6d4", demand: "#a855f7", strategic: "#64748b",
  engineering: "#475569", seo: "#eab308",
};

const CATEGORY_LABELS: Record<string, string> = {
  sales: "Sales", shipping: "Shipping", operations: "Operations", finance: "Finance",
  support: "Support", breeding: "Breeding", production: "Production", wholesale: "Wholesale",
  leads: "Leads", inbound: "Inbound", demand: "Demand", strategic: "Strategic",
  engineering: "Engineering", seo: "SEO",
};

const PREFIX_TO_CATEGORY: Record<string, string> = {
  SALES: "sales", QSALES: "sales", SHIP: "shipping", OPS: "operations",
  FIN: "finance", SUP: "support", BRD: "breeding", PROD: "production",
  WHL: "wholesale", LEAD: "leads", INB: "inbound", DMD: "demand",
  STR: "strategic", ENG: "engineering", SEO: "seo",
};

type CardItem = { id: string; name: string; category: string };

// ─── Sortable Card ──────────────────────────────────────────────
function SortableCard({ item, onRemove }: { item: CardItem; onRemove: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : "auto",
  };
  const color = CATEGORY_COLORS[item.category] || "#6b7280";

  return (
    <div ref={setNodeRef} style={style} className={`flex items-center gap-2 px-3 py-3 rounded-xl border bg-card ${isDragging ? "shadow-lg ring-2 ring-primary/30" : "border-border/50"}`}>
      {/* Drag handle — large touch target */}
      <button {...attributes} {...listeners} className="touch-none p-1 -ml-1 cursor-grab active:cursor-grabbing" style={{ minWidth: 32, minHeight: 44 }}>
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </button>

      {/* Category dot */}
      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />

      {/* Name + ID */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.name}</p>
        <p className="text-[10px] text-muted-foreground font-mono">{item.id}</p>
      </div>

      {/* Remove */}
      <button onClick={() => onRemove(item.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors" style={{ minWidth: 36, minHeight: 36 }}>
        <X className="w-4 h-4 text-muted-foreground hover:text-destructive" />
      </button>
    </div>
  );
}

// ─── Main Builder ───────────────────────────────────────────────
export function ScorecardBuilder() {
  const navigate = useNavigate();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [cards, setCards] = useState<CardItem[]>([]);
  const [allKpis, setAllKpis] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    setBreadcrumbs([{ label: "Scorecard", href: "../scorecard" }, { label: "Edit" }]);
  }, [setBreadcrumbs]);

  // Load data
  useEffect(() => {
    (async () => {
      try {
        const [namesRes, configRes] = await Promise.all([
          fetch("/api/kpi/names"),
          fetch("/api/kpi/scorecard-config"),
        ]);
        const names = await namesRes.json();
        const config = await configRes.json();
        setAllKpis(names);

        const currentCards = (config.cards || []).map((c: any) => {
          const prefix = c.id.split("-")[0];
          return {
            id: c.id,
            name: names[c.id] || c.id,
            category: PREFIX_TO_CATEGORY[prefix] || "other",
          };
        });
        setCards(currentCards);
      } catch (err) {
        console.error("Failed to load builder data:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Card IDs set (for quick lookup)
  const cardIdSet = useMemo(() => new Set(cards.map((c) => c.id)), [cards]);

  // All KPIs as a list grouped by category
  const allKpiList = useMemo(() => {
    return Object.entries(allKpis)
      .map(([id, name]) => {
        const prefix = id.split("-")[0];
        return { id, name, category: PREFIX_TO_CATEGORY[prefix] || "other" };
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [allKpis]);

  // Filtered KPIs for browser
  const filteredKpis = useMemo(() => {
    let list = allKpiList;
    if (filterCategory !== "all") {
      list = list.filter((k) => k.category === filterCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((k) => k.name.toLowerCase().includes(q) || k.id.toLowerCase().includes(q));
    }
    return list;
  }, [allKpiList, filterCategory, search]);

  // Available categories
  const categories = useMemo(() => {
    const cats = new Set(allKpiList.map((k) => k.category));
    return [...cats].sort();
  }, [allKpiList]);

  // Drag end handler
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setCards((prev) => {
        const oldIdx = prev.findIndex((c) => c.id === active.id);
        const newIdx = prev.findIndex((c) => c.id === over.id);
        return arrayMove(prev, oldIdx, newIdx);
      });
    }
  };

  // Add KPI
  const addCard = (kpi: { id: string; name: string; category: string }) => {
    if (cardIdSet.has(kpi.id)) return;
    setCards((prev) => [...prev, kpi]);
  };

  // Remove KPI
  const removeCard = (id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
  };

  // Save
  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/kpi/scorecard-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cards: cards.map((c) => ({ id: c.id, size: "1x1" })) }),
      });
      navigate("../scorecard");
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("../scorecard")} className="p-2 rounded-lg hover:bg-accent transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold">Edit Scorecard</h1>
            <p className="text-xs text-muted-foreground">{cards.length} cards</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {/* Current Cards — Drag & Drop Grid */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Your Scorecard
        </h2>

        {cards.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-border rounded-xl text-muted-foreground text-sm">
            No cards yet. Add KPIs from the browser below.
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={cards.map((c) => c.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {cards.map((card) => (
                  <SortableCard key={card.id} item={card} onRemove={removeCard} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* KPI Browser */}
      <div className="border border-border rounded-xl overflow-hidden">
        <button
          onClick={() => setBrowserOpen(!browserOpen)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-accent/30 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add KPIs ({allKpiList.length} available)
          </span>
          {browserOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {browserOpen && (
          <div className="border-t border-border">
            {/* Search + Category Filter */}
            <div className="p-3 space-y-2 border-b border-border bg-accent/20">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search KPIs by name or ID..."
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-background border border-border outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex gap-1 flex-wrap">
                <button
                  onClick={() => setFilterCategory("all")}
                  className={`px-2.5 py-1 text-xs font-bold rounded-full transition-colors ${
                    filterCategory === "all" ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  All
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setFilterCategory(cat)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-full transition-colors ${
                      filterCategory === cat ? "text-white" : "text-muted-foreground hover:text-foreground"
                    }`}
                    style={filterCategory === cat ? { backgroundColor: CATEGORY_COLORS[cat] || "#666" } : { backgroundColor: "var(--accent)" }}
                  >
                    {CATEGORY_LABELS[cat] || cat}
                  </button>
                ))}
              </div>
            </div>

            {/* KPI List */}
            <div className="max-h-[400px] overflow-y-auto">
              {filteredKpis.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">No KPIs match your search</div>
              ) : (
                filteredKpis.map((kpi) => {
                  const isAdded = cardIdSet.has(kpi.id);
                  const color = CATEGORY_COLORS[kpi.category] || "#6b7280";
                  return (
                    <button
                      key={kpi.id}
                      onClick={() => !isAdded && addCard(kpi)}
                      disabled={isAdded}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left border-b border-border/30 transition-colors ${
                        isAdded ? "opacity-40 cursor-not-allowed" : "hover:bg-accent/30 cursor-pointer"
                      }`}
                    >
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{kpi.name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{kpi.id}</p>
                      </div>
                      {isAdded ? (
                        <span className="text-[10px] text-muted-foreground font-bold">Added</span>
                      ) : (
                        <Plus className="w-4 h-4 text-primary flex-shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
