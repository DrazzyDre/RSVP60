"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import type { DashboardCharts } from "@/lib/types";

const STATUS_COLORS: Record<string, string> = {
  accepted: "#16a34a",
  waitlisted: "#d97706",
  declined: "#dc2626",
  cancelled: "#9ca3af",
};

export function SeatUsageChart({ data }: { data: DashboardCharts["seat_usage_by_tree"] }) {
  if (!data.length) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
        <XAxis dataKey="tree" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="used" name="Used seats" fill="#1E2A6B" radius={[4, 4, 0, 0]} />
        <Bar dataKey="remaining" name="Remaining" fill="#C8A24B" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StatusPie({ data }: { data: DashboardCharts["rsvp_status_breakdown"] }) {
  if (!data.length) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="status"
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={2}
          label={(e: { status?: string; count?: number }) =>
            `${e.status}: ${e.count}`
          }
          labelLine={false}
        >
          {data.map((entry) => (
            <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "#6b7280"} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function TrendLine({ data }: { data: DashboardCharts["rsvps_over_time"] }) {
  if (!data.length) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11 }}
          tickFormatter={(d) => d.slice(5)}
        />
        <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
        <Tooltip />
        <Line
          type="monotone"
          dataKey="count"
          name="RSVPs"
          stroke="#1E2A6B"
          strokeWidth={2.5}
          dot={{ r: 3, fill: "#C8A24B" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CapacityMeter({ used, allocated }: { used: number; allocated: number }) {
  const pct = allocated > 0 ? Math.min(Math.round((used / allocated) * 100), 100) : 0;
  return (
    <div className="flex h-[280px] flex-col justify-center">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <p className="text-4xl font-bold text-royal">{pct}%</p>
          <p className="text-sm text-muted-foreground">of seats confirmed</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {used} / {allocated} seats
        </p>
      </div>
      <div className="h-5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-royal to-gold transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        {Math.max(allocated - used, 0)} seats still available across all invite
        trees.
      </p>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
      No data to display yet.
    </div>
  );
}
