import { Button, Card, Col, Descriptions, Divider, InputNumber, Row, Slider, Space, Statistic, Table, Tag, Typography, type TableProps } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import type { RouteMetrics, RouteParams } from '../../hooks/useRouteMetrics';

export interface OverlapCalcPanelProps {
  params: RouteParams;
  onChange: (patch: Partial<RouteParams>) => void;
  metrics: RouteMetrics;
  onSave?: () => void;
  saving?: boolean;
  savedText?: string;
}

type SortieRow = { sortie: number; photos: number; durationMin: number };

const columns: NonNullable<TableProps<SortieRow>['columns']> = [
  { title: '架次', dataIndex: 'sortie', width: 70, render: (v: number) => `第 ${v} 架次` },
  { title: '预计张数', dataIndex: 'photos', width: 100 },
  { title: '预计耗时 min', dataIndex: 'durationMin', width: 120 },
];

/**
 * 重叠率 / 航高 / 航速表单与 GSD、航线间距、预计张数的实时回算面板。
 * 被航线规划页（/missions/:id/route）与相机预设页（/settings/camera）消费。
 */
export default function OverlapCalcPanel({ params, onChange, metrics, onSave, saving, savedText }: OverlapCalcPanelProps) {
  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }} data-testid="overlap-calc-panel">
      <Card size="small" title="航线参数">
        <Row gutter={[12, 8]}>
          <Col span={12}>
            <Typography.Text type="secondary">相对航高（m）</Typography.Text>
            <InputNumber
              style={{ width: '100%' }}
              min={20}
              max={600}
              step={5}
              value={params.altitude}
              onChange={(v) => onChange({ altitude: Number(v ?? 0) })}
            />
          </Col>
          <Col span={12}>
            <Typography.Text type="secondary">航速（m/s）</Typography.Text>
            <InputNumber
              style={{ width: '100%' }}
              min={1}
              max={25}
              step={0.5}
              value={params.speed}
              onChange={(v) => onChange({ speed: Number(v ?? 0) })}
            />
          </Col>
          <Col span={24}>
            <Typography.Text type="secondary">航向重叠率 {params.overlapForward} %</Typography.Text>
            <Slider min={50} max={90} value={params.overlapForward} onChange={(v) => onChange({ overlapForward: v })} />
          </Col>
          <Col span={24}>
            <Typography.Text type="secondary">旁向重叠率 {params.overlapSide} %</Typography.Text>
            <Slider min={40} max={90} value={params.overlapSide} onChange={(v) => onChange({ overlapSide: v })} />
          </Col>
          <Col span={24}>
            <Typography.Text type="secondary">航带方向（°）</Typography.Text>
            <Slider min={0} max={180} value={params.heading} onChange={(v) => onChange({ heading: v })} />
          </Col>
        </Row>
        {onSave ? (
          <>
            <Divider style={{ margin: '10px 0' }} />
            <Space>
              <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={onSave}>
                保存航线参数
              </Button>
              {savedText ? <Typography.Text type="secondary">{savedText}</Typography.Text> : null}
            </Space>
          </>
        ) : null}
      </Card>

      <Card size="small" title="实时回算结果">
        <Row gutter={[12, 12]}>
          <Col span={8}>
            <Statistic title="地面分辨率 GSD" value={metrics.gsd} precision={2} suffix="cm/px" />
          </Col>
          <Col span={8}>
            <Statistic title="航线间距" value={metrics.spacing} precision={2} suffix="m" />
          </Col>
          <Col span={8}>
            <Statistic title="拍照间隔" value={metrics.photoInterval} precision={2} suffix="m" />
          </Col>
          <Col span={8}>
            <Statistic title="预计张数" value={metrics.estPhotos} suffix="张" />
          </Col>
          <Col span={8}>
            <Statistic title="预计耗时" value={metrics.estDuration} precision={1} suffix="min" />
          </Col>
          <Col span={8}>
            <Statistic title="预计电池组数" value={metrics.batteryCount} suffix="组" />
          </Col>
        </Row>
        <Divider style={{ margin: '10px 0' }} />
        <Descriptions size="small" column={2} colon={false}>
          <Descriptions.Item label="测区面积">{metrics.area.toFixed(0)} m²</Descriptions.Item>
          <Descriptions.Item label="航带路径长度">{metrics.pathLength.toFixed(1)} m</Descriptions.Item>
          <Descriptions.Item label="预计航带数">{metrics.lineCount} 条</Descriptions.Item>
          <Descriptions.Item label="航点数量">{metrics.waypointCount} 个</Descriptions.Item>
          <Descriptions.Item label="航向幅宽">{metrics.coverageForward} m</Descriptions.Item>
          <Descriptions.Item label="旁向幅宽">{metrics.coverageSide} m</Descriptions.Item>
        </Descriptions>
        <div style={{ marginTop: 6 }}>
          {metrics.sorties.map((s) => (
            <Tag key={s.sortie} color="blue">
              第 {s.sortie} 架次 · {s.photos} 张 · {s.durationMin} min
            </Tag>
          ))}
        </div>
      </Card>

      <Card size="small" title="多架次拆分">
        <Table<SortieRow>
          rowKey="sortie"
          size="small"
          columns={columns}
          dataSource={metrics.sorties}
          pagination={false}
          locale={{ emptyText: '暂无架次拆分' }}
        />
      </Card>
    </Space>
  );
}
