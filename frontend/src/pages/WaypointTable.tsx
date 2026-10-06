import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  type TableProps,
} from 'antd';
import { ImportOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useMissionStore } from '../stores/missionStore';
import { useWaypointStore } from '../stores/waypointStore';
import { useAssetStore } from '../stores/assetStore';
import { useRouteMetrics, DEFAULT_ROUTE_PARAMS } from '../hooks/useRouteMetrics';
import AmapRouteView from '../components/common/AmapRouteView';
import { WAYPOINT_ACTIONS, parseWaypointText, type Waypoint, type WaypointAction } from '../types/waypoint';
import { calcGsd, groundCoverage } from '../utils/geoCalc';
import type { PublishResult } from '../utils/release';

type Columns = NonNullable<TableProps<Waypoint>['columns']>;

/** /missions/:id/waypoints 航点明细：经纬度粘贴导入、批量改高度、顺序拖拽、单点视场预览 */
export default function WaypointTable() {
  const { id = '' } = useParams();
  const missions = useMissionStore((s) => s.items);
  const loadMissions = useMissionStore((s) => s.load);
  const waypoints = useWaypointStore((s) => s.items);
  const loadWaypoints = useWaypointStore((s) => s.load);
  const addMany = useWaypointStore((s) => s.addMany);
  const update = useWaypointStore((s) => s.update);
  const setAltitudeForMission = useWaypointStore((s) => s.setAltitudeForMission);
  const move = useWaypointStore((s) => s.move);
  const reorder = useWaypointStore((s) => s.reorder);
  const remove = useWaypointStore((s) => s.remove);
  const clearMission = useWaypointStore((s) => s.removeByMission);
  const loadAssets = useAssetStore((s) => s.load);

  const mission = missions.find((m) => m.id === id);
  const rows = useMemo(
    () => waypoints.filter((w) => w.missionId === id).sort((a, b) => a.seq - b.seq),
    [waypoints, id],
  );

  const [pasteText, setPasteText] = useState('');
  const [batchAltitude, setBatchAltitude] = useState(120);
  const [previewId, setPreviewId] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const preview = rows.find((w) => w.id === previewId) ?? rows[0];
  const metrics = useRouteMetrics(id, { ...DEFAULT_ROUTE_PARAMS, altitude: preview?.altitude ?? 120 });

  /** 冲突 / 失败后从库内同步最新数据 */
  const syncLatest = async () => {
    await Promise.all([loadMissions(), loadWaypoints(), loadAssets()]);
  };

  /** 统一处理发布结果：成功提示；版本冲突被打回则同步最新数据并保留页面输入；写失败提示已回滚 */
  const handlePublish = (result: PublishResult | null, okText?: string): boolean => {
    if (result === null) return false;
    if (result.ok) {
      setError('');
      if (okText) setToast(okText);
      return true;
    }
    if (result.reason === 'conflict') {
      setError(
        `修改被驳回：该任务已在其他标签页发布 v${result.currentVersion}，本次修改未写入、未覆盖对方内容。已同步最新数据，你的输入保留在页面上，可核对后重试。`,
      );
      void syncLatest();
      return false;
    }
    setError(`写入失败，已回滚：${result.message}。原版本与成果影像质量均未改动。`);
    return false;
  };

  const importPaste = async () => {
    const parsed = parseWaypointText(pasteText);
    if (parsed.length === 0) {
      setError('未解析到有效经纬度：每行应为「经度,纬度[,航高]」');
      return;
    }
    const startSeq = rows.length === 0 ? 1 : Math.max(...rows.map((w) => w.seq)) + 1;
    const result = await addMany(
      parsed.map((p, index) => ({
        missionId: id,
        seq: startSeq + index,
        lng: Number(p.lng.toFixed(6)),
        lat: Number(p.lat.toFixed(6)),
        altitude: p.altitude ?? batchAltitude,
        speed: 8,
        heading: 90,
        gimbalPitch: -90,
        action: '拍照' as WaypointAction,
        hoverSec: 0,
      })),
    );
    // 仅发布成功才清空粘贴文本；被驳回时保留输入
    if (handlePublish(result, `已导入 ${parsed.length} 个航点（序号 ${startSeq} 起）`)) {
      setPasteText('');
    }
  };

  const applyBatchAltitude = async () => {
    const result = await setAltitudeForMission(id, batchAltitude);
    handlePublish(result, `已把 ${rows.length} 个航点的高度统一改为 ${batchAltitude} m`);
  };

  const columns: Columns = [
    { title: '序号', dataIndex: 'seq', width: 70, render: (v: number) => `#${v}` },
    { title: '经度', dataIndex: 'lng', width: 120, render: (v: number) => v.toFixed(6) },
    { title: '纬度', dataIndex: 'lat', width: 120, render: (v: number) => v.toFixed(6) },
    {
      title: '相对航高 m',
      width: 140,
      render: (_: unknown, row: Waypoint) => (
        <InputNumber size="small" min={20} max={600} value={row.altitude} onChange={(v) => void update(row.id, { altitude: Number(v ?? 0) }).then(handlePublish)} />
      ),
    },
    {
      title: '航速 m/s',
      width: 120,
      render: (_: unknown, row: Waypoint) => (
        <InputNumber size="small" min={1} max={25} step={0.5} value={row.speed} onChange={(v) => void update(row.id, { speed: Number(v ?? 0) }).then(handlePublish)} />
      ),
    },
    {
      title: '航向 °',
      width: 120,
      render: (_: unknown, row: Waypoint) => (
        <InputNumber size="small" min={0} max={360} value={row.heading} onChange={(v) => void update(row.id, { heading: Number(v ?? 0) }).then(handlePublish)} />
      ),
    },
    {
      title: '云台俯仰 °',
      width: 130,
      render: (_: unknown, row: Waypoint) => (
        <InputNumber size="small" min={-90} max={30} value={row.gimbalPitch} onChange={(v) => void update(row.id, { gimbalPitch: Number(v ?? 0) }).then(handlePublish)} />
      ),
    },
    {
      title: '动作',
      width: 120,
      render: (_: unknown, row: Waypoint) => (
        <Select
          size="small"
          style={{ width: 100 }}
          value={row.action}
          onChange={(v) => void update(row.id, { action: v as WaypointAction }).then(handlePublish)}
          options={WAYPOINT_ACTIONS.map((a) => ({ value: a, label: a }))}
        />
      ),
    },
    {
      title: '悬停 s',
      width: 110,
      render: (_: unknown, row: Waypoint) => (
        <InputNumber size="small" min={0} max={300} value={row.hoverSec} onChange={(v) => void update(row.id, { hoverSec: Number(v ?? 0) }).then(handlePublish)} />
      ),
    },
    {
      title: '视场（宽×航向）m',
      width: 170,
      render: (_: unknown, row: Waypoint) =>
        mission
          ? `${groundCoverage(mission.sensorWidth, row.altitude, mission.focalLength)} × ${groundCoverage(
              mission.sensorHeight,
              row.altitude,
              mission.focalLength,
            )}`
          : '—',
    },
    {
      title: '单点 GSD cm/px',
      width: 140,
      render: (_: unknown, row: Waypoint) =>
        mission ? calcGsd(mission.pixelSize, row.altitude, mission.focalLength) : '—',
    },
    {
      title: '顺序',
      width: 210,
      render: (_: unknown, row: Waypoint, index: number) => (
        <Space size={4}>
          <Button size="small" disabled={index === 0} onClick={() => void move(row.id, 'up').then(handlePublish)}>
            上移
          </Button>
          <Button size="small" disabled={index === rows.length - 1} onClick={() => void move(row.id, 'down').then(handlePublish)}>
            下移
          </Button>
          <span
            draggable
            title="拖拽到目标行可交换顺序"
            style={{ cursor: 'grab', color: '#97a0ad' }}
            onDragStart={() => setPreviewId(row.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => void reorder(row.id, previewId).then(handlePublish)}
          >
            ⣿
          </span>
        </Space>
      ),
    },
    {
      title: '操作',
      width: 150,
      render: (_: unknown, row: Waypoint) => (
        <Space size={4}>
          <Button size="small" onClick={() => setPreviewId(row.id)}>
            预览视场
          </Button>
          <Button size="small" danger onClick={() => void remove(row.id).then(handlePublish)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  if (!mission) {
    return (
      <Space direction="vertical">
        <Alert type="warning" showIcon message="未找到该任务" />
        <Link to="/missions">返回任务台账</Link>
      </Space>
    );
  }

  return (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      <Space wrap align="center">
        <Typography.Title level={4} style={{ margin: 0 }}>
          航点明细 · {mission.missionNo}
        </Typography.Title>
        <Tag color="green">航点 {rows.length} 个</Tag>
        <Tag color="blue">版本 v{mission.version}</Tag>
        <Tag>传感器 {mission.sensorWidth}×{mission.sensorHeight} mm / f{mission.focalLength} mm</Tag>
        <div style={{ flex: 1 }} />
        <Button type="link">
          <Link to={`/missions/${mission.id}/route`}>航线规划</Link>
        </Button>
        <Button type="link">
          <Link to={`/missions/${mission.id}/assets`}>成果编目</Link>
        </Button>
        <Button danger size="small" onClick={() => void clearMission(mission.id).then((r) => handlePublish(r, '已清空本任务航点'))}>
          清空本任务航点
        </Button>
      </Space>

      {toast ? <Alert type="success" showIcon message={toast} closable onClose={() => setToast('')} /> : null}
      {error ? <Alert type="error" showIcon message={error} closable onClose={() => setError('')} /> : null}

      <Row gutter={14}>
        <Col span={10}>
          <Card size="small" title="经纬度粘贴导入">
            <Input.TextArea
              rows={6}
              placeholder={'每行一个点，例如：\n116.391200,39.907500\n116.393000,39.906800,150'}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
            />
            <Space style={{ marginTop: 8 }}>
              <Button type="primary" icon={<ImportOutlined />} onClick={importPaste}>
                导入航点
              </Button>
              <Button onClick={() => setPasteText('')}>清空文本</Button>
            </Space>
          </Card>
          <Card size="small" title="批量修改高度" style={{ marginTop: 12 }}>
            <Space>
              <InputNumber min={20} max={600} step={5} value={batchAltitude} onChange={(v) => setBatchAltitude(Number(v ?? 0))} />
              <span>m</span>
              <Button icon={<ThunderboltOutlined />} onClick={applyBatchAltitude} disabled={rows.length === 0}>
                应用到全部航点
              </Button>
            </Space>
          </Card>
          <Card size="small" title="单点视场预览" style={{ marginTop: 12 }}>
            {preview ? (
              <>
                <Descriptions size="small" column={1} colon={false}>
                  <Descriptions.Item label="航点">#{preview.seq}（{preview.lng.toFixed(5)}, {preview.lat.toFixed(5)}）</Descriptions.Item>
                  <Descriptions.Item label="航高 / 航速 / 云台">
                    {preview.altitude} m / {preview.speed} m/s / {preview.gimbalPitch}°
                  </Descriptions.Item>
                  <Descriptions.Item label="视场覆盖">
                    旁向 {groundCoverage(mission.sensorWidth, preview.altitude, mission.focalLength)} m × 航向{' '}
                    {groundCoverage(mission.sensorHeight, preview.altitude, mission.focalLength)} m
                  </Descriptions.Item>
                  <Descriptions.Item label="单点 GSD">
                    {calcGsd(mission.pixelSize, preview.altitude, mission.focalLength)} cm/px
                  </Descriptions.Item>
                </Descriptions>
                <Row gutter={8} style={{ marginTop: 8 }}>
                  <Col span={8}>
                    <Statistic title="任务总航程" value={metrics.pathLength} precision={1} suffix="m" />
                  </Col>
                  <Col span={8}>
                    <Statistic title="预计张数" value={metrics.estPhotos} suffix="张" />
                  </Col>
                  <Col span={8}>
                    <Statistic title="预计耗时" value={metrics.estDuration} precision={1} suffix="min" />
                  </Col>
                </Row>
              </>
            ) : (
              <Empty description="暂无航点可预览" imageStyle={{ height: 40 }} />
            )}
          </Card>
        </Col>
        <Col span={14}>
          <Card size="small" title="航点位置（预览航点高亮）">
            <AmapRouteView
              mission={mission}
              waypoints={rows}
              altitude={preview?.altitude ?? 120}
              height={360}
              highlightSeq={preview?.seq}
            />
          </Card>
        </Col>
      </Row>

      <Card size="small" title="航点表格（可改高度/航速/航向/云台/动作，支持上下移与拖拽换序）">
        <Table<Waypoint>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={rows}
          pagination={false}
          scroll={{ x: 1600 }}
          locale={{ emptyText: '暂无航点，请先粘贴导入' }}
        />
      </Card>
    </Space>
  );
}
