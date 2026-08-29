"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface DistributionBucket {
  range: string;
  count: number;
}

interface SubjectAverage {
  name: string;
  avgMarks: number;
  maxMarks: number;
}

const BAR_COLORS = ["#75507E", "#8a5f93", "#a374ac", "#400C4D", "#FF8C00"];

export function ScoreDistributionChart({ data }: { data: DistributionBucket[] }) {
  if (data.every((d) => d.count === 0)) {
    return <p className="text-sm text-slate-400 py-8 text-center">No results yet to chart.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E6DAE9" vertical={false} />
        <XAxis dataKey="range" tick={{ fontSize: 11, fill: "#8a5f93" }} axisLine={{ stroke: "#E6DAE9" }} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#8a5f93" }} axisLine={{ stroke: "#E6DAE9" }} tickLine={false} />
        <Tooltip
          contentStyle={{ borderRadius: 8, border: "1px solid #E6DAE9", fontSize: 12 }}
          formatter={(value) => [`${value ?? 0} student${value === 1 ? "" : "s"}`, "Count"]}
        />
        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill="#400C4D" />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SubjectAverageChart({ data }: { data: SubjectAverage[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-400 py-8 text-center">No subject data yet.</p>;
  }
  const chartData = data.map((d) => ({
    ...d,
    avgPercent: d.maxMarks > 0 ? Math.round((d.avgMarks / d.maxMarks) * 1000) / 10 : 0,
  }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E6DAE9" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "#8a5f93" }} axisLine={{ stroke: "#E6DAE9" }} tickLine={false} unit="%" />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#221126" }} axisLine={false} tickLine={false} width={90} />
        <Tooltip
          contentStyle={{ borderRadius: 8, border: "1px solid #E6DAE9", fontSize: 12 }}
          formatter={(value, _n, entry) => {
            const p = entry?.payload as SubjectAverage & { avgPercent: number } | undefined;
            return [`${p ? p.avgMarks.toFixed(1) : "—"} / ${p?.maxMarks ?? "—"} (${value ?? 0}%)`, "Average"];
          }}
        />
        <Bar dataKey="avgPercent" radius={[0, 6, 6, 0]}>
          {chartData.map((_, i) => (
            <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
