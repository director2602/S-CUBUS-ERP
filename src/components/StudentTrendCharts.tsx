"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface HistoryPoint {
  examLabel: string;
  percentage: number;
  percentile: number | null;
  rank: number | null;
  total: number;
}

const LINE_COLORS = ["#400C4D", "#FF8C00", "#1F9D55", "#5c1a6b", "#B45309"];

/** Score & percentile over every exam in chronological order. */
export function PerformanceTrendChart({ data }: { data: HistoryPoint[] }) {
  if (data.length < 2) {
    return (
      <p className="text-sm text-slate-400 py-8 text-center">
        Needs at least 2 results to plot a trend — only {data.length} available.
      </p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: -12, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E6DAE9" vertical={false} />
        <XAxis dataKey="examLabel" tick={{ fontSize: 11, fill: "#8a5f93" }} axisLine={{ stroke: "#E6DAE9" }} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#8a5f93" }} axisLine={{ stroke: "#E6DAE9" }} tickLine={false} unit="%" />
        <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E6DAE9", fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="percentage" name="Percentage" stroke="#400C4D" strokeWidth={2.5} dot={{ r: 4 }} />
        <Line type="monotone" dataKey="percentile" name="Percentile" stroke="#FF8C00" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

interface SubjectHistoryPoint {
  examLabel: string;
  [subjectName: string]: string | number;
}

export function SubjectTrendChart({ data, subjectNames }: { data: SubjectHistoryPoint[]; subjectNames: string[] }) {
  if (data.length < 2 || subjectNames.length === 0) {
    return (
      <p className="text-sm text-slate-400 py-8 text-center">
        Needs at least 2 results with subject data to plot a subject trend.
      </p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: -12, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E6DAE9" vertical={false} />
        <XAxis dataKey="examLabel" tick={{ fontSize: 11, fill: "#8a5f93" }} axisLine={{ stroke: "#E6DAE9" }} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#8a5f93" }} axisLine={{ stroke: "#E6DAE9" }} tickLine={false} unit="%" />
        <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E6DAE9", fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {subjectNames.map((name, i) => (
          <Line
            key={name}
            type="monotone"
            dataKey={name}
            name={name}
            stroke={LINE_COLORS[i % LINE_COLORS.length]}
            strokeWidth={2.5}
            dot={{ r: 3.5 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
