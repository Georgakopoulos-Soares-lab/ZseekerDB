/** The fields of an ECharts tooltip/label callback parameter that this site's charts read. */
export type ChartParam = {
  name: string;
  seriesName?: string;
  value: unknown;
  dataIndex: number;
  axisValue?: string | number;
  data: Record<string, unknown> | null;
};
