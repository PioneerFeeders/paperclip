import { useEffect, useState } from "react";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { BarChart3, TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";
import { PageSkeleton } from "../components/PageSkeleton";

// Category colors (zone-based)
const CATEGORY_COLORS: Record<string, string> = {
  sales: "#22c55e",
  shipping: "#3b82f6",
  operations: "#f59e0b",
  finance: "#8b5cf6",
  support: "#f97316",
  breeding: "#ec4899",
  production: "#14b8a6",
  wholesale: "#6366f1",
  leads: "#84cc16",
  inbound: "#06b6d4",
};

type KpiValue = {
  id: string;
  value: string | number;
  recordedAt: string;
  metadata?: any;
};

type CardConfig = {
  id: string;
  size?: string;
};

type ScorecardConfig = {
  cards: CardConfig[];
};

// Simple sparkline component
function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (!points || points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const h = 32;
  const w = 80;
  const step = w / (points.length - 1);

  const pathD = points
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} className="opacity-60">
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// KPI Card component (Databox-style)
function KpiCard({
  kpiId,
  value,
  name,
  category,
  sparklineData,
}: {
  kpiId: string;
  value: string | number | null;
  name: string;
  category: string;
  sparklineData?: number[];
}) {
  const color = CATEGORY_COLORS[category] || "#6b7280";
  const displayValue = value !== null && value !== undefined ? String(value) : "—";

  // Simple trend: compare last vs first sparkline point
  let trend: "up" | "down" | "flat" = "flat";
  if (sparklineData && sparklineData.length >= 2) {
    const first = sparklineData[0];
    const last = sparklineData[sparklineData.length - 1];
    if (last > first * 1.02) trend = "up";
    else if (last < first * 0.98) trend = "down";
  }

  return (
    <div className="rounded-xl border border-border/50 bg-card p-4 hover:bg-accent/30 transition-colors">
      {/* Category indicator */}
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
          style={{ backgroundColor: color + "20", color }}
        >
          {category}
        </span>
        <span className="text-[10px] text-muted-foreground font-mono">{kpiId}</span>
      </div>

      {/* Value + trend */}
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-2xl font-bold tracking-tight tabular-nums">{displayValue}</p>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{name}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {trend === "up" && <TrendingUp className="w-4 h-4 text-green-500" />}
          {trend === "down" && <TrendingDown className="w-4 h-4 text-red-500" />}
          {trend === "flat" && <Minus className="w-4 h-4 text-muted-foreground" />}
          <Sparkline points={sparklineData || []} color={color} />
        </div>
      </div>
    </div>
  );
}

export function Scorecard() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const [config, setConfig] = useState<ScorecardConfig | null>(null);
  const [values, setValues] = useState<Record<string, KpiValue>>({});
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "Scorecard" }]);
  }, [setBreadcrumbs]);

  // Load scorecard config + KPI values
  const loadData = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      // Get scorecard config
      const configRes = await fetch("/api/kpi/scorecard-config");
      const configData = await configRes.json();
      setConfig(configData);

      // Get KPI values
      const ids = (configData.cards || []).map((c: CardConfig) => c.id).join(",");
      if (ids) {
        const valuesRes = await fetch(`/api/kpi/values?ids=${ids}`);
        const valuesData = await valuesRes.json();
        const valMap: Record<string, KpiValue> = {};
        (valuesData.values || []).forEach((v: KpiValue) => {
          valMap[v.id] = v;
        });
        setValues(valMap);

        // Get sparklines for each KPI
        const sparkPromises = (configData.cards || []).map(async (card: CardConfig) => {
          try {
            const res = await fetch(`/api/kpi/sparkline?id=${card.id}&days=14`);
            const data = await res.json();
            return { id: card.id, points: (data.points || []).map((p: any) => p.value) };
          } catch {
            return { id: card.id, points: [] };
          }
        });

        const sparkResults = await Promise.all(sparkPromises);
        const sparkMap: Record<string, number[]> = {};
        sparkResults.forEach((s) => {
          sparkMap[s.id] = s.points;
        });
        setSparklines(sparkMap);
      }

      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      console.error("Failed to load scorecard:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) return <PageSkeleton />;

  // Build a name map from KPI IDs (we'll enhance this later with the registry)
  const kpiNames: Record<string, { name: string; category: string }> = {};
  // For now, derive from ID prefix
  (config?.cards || []).forEach((card) => {
    const prefix = card.id.split("-")[0];
    const prefixMap: Record<string, string> = {
      SALES: "sales", QSALES: "sales", SHIP: "shipping", OPS: "operations",
      FIN: "finance", SUP: "support", BRD: "breeding", PROD: "production",
      WHL: "wholesale", LEAD: "leads", INB: "inbound", DMD: "demand",
      STR: "strategic", ENG: "engineering", SEO: "seo",
    };
    kpiNames[card.id] = {
      name: values[card.id]?.metadata?.name || card.id.replace(/-/g, " "),
      category: prefixMap[prefix] || "other",
    };
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6" />
            KPI Scorecard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pioneer Feeders — Business Health at a Glance
            {lastUpdated && <span className="ml-2">· Updated {lastUpdated}</span>}
          </p>
        </div>
        <button
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {(config?.cards || []).map((card) => (
          <KpiCard
            key={card.id}
            kpiId={card.id}
            value={values[card.id]?.value ?? null}
            name={kpiNames[card.id]?.name || card.id}
            category={kpiNames[card.id]?.category || "other"}
            sparklineData={sparklines[card.id]}
          />
        ))}
      </div>

      {(!config?.cards || config.cards.length === 0) && (
        <div className="text-center py-12 text-muted-foreground">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No KPIs configured</p>
          <p className="text-sm mt-1">Use the scorecard builder to add KPI cards</p>
        </div>
      )}
    </div>
  );
}
