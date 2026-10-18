'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  EvidenceCategoryDb,
  PrivilegeFlagDb,
} from '@/lib/db';

// Palette pulled from tailwind.config.ts semantic tokens — no new design
// tokens introduced. Primary (indigo) for neutral volume, warning (red) /
// filter (amber) reserved for anything that implies quarantine review.
const PRIMARY = '#3730a3';
const MUTED = '#94a3b8'; // slate-400, for de-emphasized NONE privilege
const WARM = '#b91c1c'; // warning red, for non-NONE privilege flags
const CATEGORY_COLOR: Record<EvidenceCategoryDb, string> = {
  KEYSTROKE_BATCH: '#3730a3',
  APP_EVENT: '#4338ca',
  COMMS_METADATA: '#6366f1',
  RISK_DETECTION: '#b45309', // filter amber — risk detections warrant attention
};

export function EvidenceByDayChart({
  data,
}: {
  data: Array<{ date: string; count: number }>;
}) {
  if (data.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted">
        No evidence captured yet.
      </p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: '#475569' }}
          tickLine={false}
          axisLine={{ stroke: '#e2e8f0' }}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: '#475569' }}
          tickLine={false}
          axisLine={false}
          width={32}
        />
        <Tooltip
          contentStyle={{ fontSize: 12, border: '1px solid #e2e8f0' }}
          labelStyle={{ color: '#0f172a' }}
        />
        <Bar dataKey="count" fill={PRIMARY} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function EvidenceByCategoryChart({
  data,
}: {
  data: Record<EvidenceCategoryDb, number>;
}) {
  const rows = (Object.entries(data) as [EvidenceCategoryDb, number][]).map(
    ([category, count]) => ({ category, count }),
  );
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  if (total === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted">
        No evidence captured yet.
      </p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart
        data={rows}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis
          type="number"
          allowDecimals={false}
          tick={{ fontSize: 11, fill: '#475569' }}
          tickLine={false}
          axisLine={{ stroke: '#e2e8f0' }}
        />
        <YAxis
          type="category"
          dataKey="category"
          tick={{ fontSize: 10, fill: '#475569' }}
          tickLine={false}
          axisLine={false}
          width={130}
        />
        <Tooltip
          contentStyle={{ fontSize: 12, border: '1px solid #e2e8f0' }}
          labelStyle={{ color: '#0f172a' }}
        />
        <Bar dataKey="count" radius={[0, 2, 2, 0]}>
          {rows.map((r) => (
            <Cell key={r.category} fill={CATEGORY_COLOR[r.category]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function EvidenceByPrivilegeChart({
  data,
}: {
  data: Record<PrivilegeFlagDb, number>;
}) {
  const rows = (Object.entries(data) as [PrivilegeFlagDb, number][])
    .map(([flag, count]) => ({ flag, count }))
    .filter((r) => r.count > 0);
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  if (total === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted">
        No evidence captured yet.
      </p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={rows}
          dataKey="count"
          nameKey="flag"
          innerRadius={50}
          outerRadius={90}
          paddingAngle={2}
        >
          {rows.map((r) => (
            <Cell
              key={r.flag}
              fill={r.flag === 'NONE' ? MUTED : WARM}
              stroke="#fff"
              strokeWidth={1}
            />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ fontSize: 12, border: '1px solid #e2e8f0' }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
