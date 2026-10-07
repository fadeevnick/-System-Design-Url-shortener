import { Injectable } from '@nestjs/common';

type Labels = Record<string, string | number>;

type TimerValue = {
  count: number;
  sumMs: number;
  maxMs: number;
};

@Injectable()
export class MetricsService {
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();
  private readonly timers = new Map<string, TimerValue>();

  increment(name: string, labels: Labels = {}, amount = 1) {
    const key = this.key(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + amount);
  }

  observeMs(name: string, durationMs: number, labels: Labels = {}) {
    const key = this.key(name, labels);
    const current = this.timers.get(key) ?? { count: 0, sumMs: 0, maxMs: 0 };

    this.timers.set(key, {
      count: current.count + 1,
      sumMs: current.sumMs + durationMs,
      maxMs: Math.max(current.maxMs, durationMs),
    });
  }

  setGauge(name: string, value: number, labels: Labels = {}) {
    const key = this.key(name, labels);
    this.gauges.set(key, value);
  }

  renderText(): string {
    const lines: string[] = [];

    for (const [key, value] of [...this.counters.entries()].sort()) {
      lines.push(`${key} ${value}`);
    }

    for (const [key, value] of [...this.gauges.entries()].sort()) {
      lines.push(`${key} ${value}`);
    }

    for (const [key, value] of [...this.timers.entries()].sort()) {
      lines.push(`${key}_count ${value.count}`);
      lines.push(`${key}_sum_ms ${Math.round(value.sumMs)}`);
      lines.push(`${key}_avg_ms ${Math.round(value.sumMs / value.count)}`);
      lines.push(`${key}_max_ms ${Math.round(value.maxMs)}`);
    }

    return `${lines.join('\n')}\n`;
  }

  private key(name: string, labels: Labels): string {
    const entries = Object.entries(labels);

    if (entries.length === 0) {
      return name;
    }

    const renderedLabels = entries
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([label, value]) => `${label}="${value}"`)
      .join(',');

    return `${name}{${renderedLabels}}`;
  }
}
