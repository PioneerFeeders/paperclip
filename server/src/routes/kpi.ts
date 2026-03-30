/**
 * KPI Routes — Serves KPI data from KEEL Kernel database for the scorecard dashboard.
 * Connects to KEEL_DATABASE_URL (external Postgres, read-only).
 */
import { Router } from "express";
import pg from "pg";

const { Pool } = pg;

const KEEL_DB_URL = process.env.KEEL_DATABASE_URL;

let keelPool: InstanceType<typeof Pool> | null = null;

function getKeelPool() {
  if (!keelPool && KEEL_DB_URL) {
    keelPool = new Pool({
      connectionString: KEEL_DB_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
    });
  }
  return keelPool;
}

// Full KPI name registry — extracted from keel-advisors/src/config/kpi-registry.js
const KPI_NAMES: Record<string, string> = {
  "SALES-01": "Total Revenue This Week", "SALES-02": "Net Profit", "SALES-03": "Average Order Value (AOV)",
  "SALES-04": "Total Number of Orders", "SALES-05": "Percent Fulfilled Today", "SALES-06": "Wholesale Revenue",
  "QSALES-01": "Gross Revenue WTD", "QSALES-02": "Net Revenue WTD", "QSALES-03": "Hornworm Cups Sold WTD",
  "QSALES-04": "Silkworm Cups Sold WTD", "QSALES-08": "WoW Revenue Pace", "QSALES-09": "Collected Revenue WTD",
  "QSALES-10": "Outstanding Revenue WTD", "QSALES-11": "Last Week Revenue", "QSALES-12": "30-Day Avg Weekly Revenue",
  "QSALES-21": "Monthly Revenue (MTD)", "QSALES-22": "Last Month Revenue",
  "SHIP-01": "Customer Paid Shipping", "SHIP-02": "ShipStation Label Cost", "SHIP-03": "UPS Actual Bill",
  "SHIP-04": "Shipping Bill Difference ($)", "SHIP-05": "Number of UPS Shipments", "SHIP-06": "Dimensional Corrections",
  "SHIP-07": "UPS Correction Rate (%)", "SHIP-08": "Late Shipments", "SHIP-09": "UPS Bill as % of Revenue",
  "SHIP-10": "Shipping Cost vs Collected Delta (%)", "SHIP-11": "Avg Transit Time (Days)",
  "SHIP-13": "Carrier Performance Score", "SHIP-15": "UPS Guaranteed Late Shipments",
  "SHIP-16": "UPS Claim Refund Potential ($)", "SHIP-18": "Shipping Coverage Ratio (%)",
  "SHIP-20": "On-Time Delivery Rate (%)", "SHIP-31": "Total Shipments Last Week",
  "FIN-01": "Liquidity Rate", "FIN-02": "Payouts Received (WTD)", "FIN-03": "Total Payouts (EOW)",
  "FIN-04": "Weekly Payroll Total", "FIN-05": "Payroll as % of Revenue",
  "FIN-11": "Customer Shipping Revenue LW", "FIN-13": "Label Cost LW", "FIN-15": "UPS Actual Billed LW",
  "FIN-17": "Shipping Margin LW", "FIN-19": "Label vs Billed Gap LW",
  "SUP-01": "Support Tickets This Week", "SUP-02": "Open Tickets", "SUP-03": "Weekly DOA Rate (%)",
  "SUP-04": "Monthly DOA Rate (%)", "SUP-05": "Lifetime DOA Rate (%)",
  "OPS-01": "Hornworm Cups Poured This Week", "OPS-01B": "Cups Poured Last Week",
  "OPS-02": "Monday Queue Size", "OPS-06": "Weekly Clearance Rate (%)", "OPS-07": "Unshipped Queue",
  "BRD-01": "Hornworm Egg Harvest (Grams)", "BRD-02": "Pre-Pupae Collected", "BRD-03": "Pre-Pupae Survival Rate",
  "BRD-04": "Egg Production Prediction", "BRD-05": "Eggs Harvested (Count)",
  "PROD-01": "Hornworm Cups Sold (All)", "PROD-02": "Hornworm Cups — Chewy", "PROD-03": "Hornworm Cups — Amazon",
  "PROD-04": "Hornworm Cups — Wholesale", "PROD-05": "Hornworm Cups — DTC", "PROD-06": "Silkworm Cups Sold (All)",
  "WHL-01": "Total Wholesale Customers", "WHL-02": "Active Wholesale Customers", "WHL-03": "New Wholesale This Week",
  "DMD-01": "Chewy Forecast (Next Month)", "DMD-02": "Shopify Weekly Cup Sales", "DMD-03": "Production vs Demand Gap",
  "INB-01": "Active Inbound Shipments", "LEAD-01": "Enriched Wholesale Leads",
  "STR-01": "Channel Revenue Mix", "ENG-01": "KEEL Kernel Status",
  "SEO-01": "SEO Health Score", "SEO-09": "Keywords in Top 10", "SEO-10": "Organic Search Traffic",
};

export function kpiRoutes() {
  const router = Router();

  /**
   * GET /kpi/names
   * Returns the full KPI name registry
   */
  router.get("/kpi/names", (_req, res) => {
    res.json(KPI_NAMES);
  });

  /**
   * GET /kpi/registry
   * Returns the full KPI registry (IDs, names, categories)
   * Used by the scorecard builder to pick KPIs
   */
  router.get("/kpi/registry", async (_req, res) => {
    try {
      // Return the KPI registry from the keel-advisors config
      // For now, we load it from a static list. Later, this could come from DB.
      const registry = await loadKpiRegistry();
      res.json(registry);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /kpi/values
   * Fetch live KPI values from KEEL Kernel DB
   * Query: ?ids=SALES-01,SHIP-01,FIN-01
   */
  router.get("/kpi/values", async (req, res) => {
    try {
      const pool = getKeelPool();
      if (!pool) {
        return res.status(503).json({ error: "KEEL_DATABASE_URL not configured" });
      }

      const idsParam = (req.query.ids as string) || "";
      const ids = idsParam.split(",").filter(Boolean);

      if (ids.length === 0) {
        return res.json({ values: [] });
      }

      // Query KPI snapshots from KEEL advisors schema
      const result = await pool.query(
        `SELECT kpi_id, actual_value, snapshot_date, rag_status, rag_color, owner_advisor, target_value
         FROM advisors.kpi_snapshots
         WHERE kpi_id = ANY($1)
         ORDER BY snapshot_date DESC`,
        [ids],
      );

      // Group by KPI ID, take most recent value
      const latest: Record<string, any> = {};
      for (const row of result.rows) {
        if (!latest[row.kpi_id]) {
          latest[row.kpi_id] = {
            id: row.kpi_id,
            value: row.actual_value,
            recordedAt: row.snapshot_date,
            ragStatus: row.rag_status,
            ragColor: row.rag_color,
            owner: row.owner_advisor,
            target: row.target_value,
          };
        }
      }

      res.json({ values: Object.values(latest) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /kpi/sparkline
   * Fetch historical values for sparkline chart
   * Query: ?id=SALES-01&days=30
   */
  router.get("/kpi/sparkline", async (req, res) => {
    try {
      const pool = getKeelPool();
      if (!pool) {
        return res.status(503).json({ error: "KEEL_DATABASE_URL not configured" });
      }

      const id = req.query.id as string;
      const days = parseInt(req.query.days as string) || 30;

      if (!id) {
        return res.status(400).json({ error: "id parameter required" });
      }

      const result = await pool.query(
        `SELECT kpi_id, actual_value, snapshot_date
         FROM advisors.kpi_snapshots
         WHERE kpi_id = $1 AND snapshot_date >= CURRENT_DATE - INTERVAL '${days} days'
         ORDER BY snapshot_date ASC`,
        [id],
      );

      res.json({
        id,
        days,
        points: result.rows.map((r) => ({
          value: parseFloat(r.actual_value),
          date: r.snapshot_date,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /kpi/scorecard-config
   * Get scorecard configuration from advisors.scorecard_configs table
   * Each row = one KPI card: { kpi_id, section_label, engine, display_order }
   */
  router.get("/kpi/scorecard-config", async (_req, res) => {
    try {
      const pool = getKeelPool();
      if (!pool) {
        return res.json({
          cards: [
            { id: "SALES-01", size: "1x1" },
            { id: "SALES-02", size: "1x1" },
            { id: "SHIP-01", size: "1x1" },
            { id: "FIN-01", size: "1x1" },
            { id: "SUP-01", size: "1x1" },
            { id: "OPS-01", size: "1x1" },
          ],
        });
      }

      const result = await pool.query(
        `SELECT kpi_id, section_label, engine, display_order
         FROM advisors.scorecard_configs
         WHERE is_active = true AND scorecard_type = 'pulse'
         ORDER BY display_order ASC`,
      );

      if (result.rows.length > 0) {
        res.json({
          cards: result.rows.map((r) => ({
            id: r.kpi_id,
            section: r.section_label,
            engine: r.engine,
            order: r.display_order,
            size: "1x1",
          })),
        });
      } else {
        // Fallback: get all active scorecard entries regardless of type
        const allResult = await pool.query(
          `SELECT kpi_id, section_label, engine, display_order, scorecard_type
           FROM advisors.scorecard_configs
           WHERE is_active = true
           ORDER BY display_order ASC`,
        );

        res.json({
          cards: allResult.rows.map((r) => ({
            id: r.kpi_id,
            section: r.section_label,
            engine: r.engine,
            order: r.display_order,
            size: "1x1",
          })),
        });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

/**
 * Load KPI registry from keel-advisors config
 * Returns a simplified list for the scorecard builder
 */
async function loadKpiRegistry() {
  const pool = getKeelPool();
  if (!pool) {
    return { kpis: [] };
  }

  // Try to get KPI targets which have the names
  try {
    const result = await pool.query(
      `SELECT kpi_id, kpi_name, category, target_value, target_unit, direction
       FROM advisors.kpi_targets
       ORDER BY kpi_id`,
    );

    if (result.rows.length > 0) {
      return {
        kpis: result.rows.map((r) => ({
          id: r.kpi_id,
          name: r.kpi_name || r.kpi_id,
          category: r.category || r.kpi_id.split("-")[0].toLowerCase(),
          target: r.target_value,
          unit: r.target_unit,
          direction: r.direction,
        })),
      };
    }
  } catch {
    // Table might not exist
  }

  // Fallback: return IDs grouped by prefix
  const prefixes = [
    { prefix: "SALES", category: "sales", label: "Sales & Revenue" },
    { prefix: "SHIP", category: "shipping", label: "Shipping & Logistics" },
    { prefix: "OPS", category: "operations", label: "Operations" },
    { prefix: "FIN", category: "finance", label: "Finance" },
    { prefix: "SUP", category: "support", label: "Customer Support" },
    { prefix: "BRD", category: "breeding", label: "Breeding" },
    { prefix: "PROD", category: "production", label: "Production" },
    { prefix: "WHL", category: "wholesale", label: "Wholesale" },
    { prefix: "LEAD", category: "leads", label: "Lead Pipeline" },
    { prefix: "INB", category: "inbound", label: "Inbound Supply" },
  ];

  return { kpis: [], categories: prefixes };
}
