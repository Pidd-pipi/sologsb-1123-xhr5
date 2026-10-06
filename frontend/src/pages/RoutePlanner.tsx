import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Button, Card, Col, Row, Space, Table, Tag, Typography, type TableProps } from 'antd';
import { useMissionStore } from '../stores/missionStore';
import { useWaypointStore } from '../stores/waypointStore';
import { useRouteMetrics, DEFAULT_ROUTE_PARAMS, type RouteParams } from '../hooks/useRouteMetrics';
import AmapRouteView from '../components/common/AmapRouteView';
import OverlapCalcPanel from '../components/common/OverlapCalcPanel';
import { loadFlightLine, splitSorties } from '../utils/db';
import { newId } from '../utils/id';
import type { FlightLine } from '../types/flightline';
import type { Waypoint } from '../types/waypoint';

type LineRow = { key: string; label: string; value: string };

const lineColumns: NonNullable<TableProps<LineRow>['columns']> = [
  { title: '项', dataIndex: 'label', width: 160 },
  { title: '值', dataIndex: 'value' },
];

/** /missions/:id/route 航线规划主视图：地图 + 参数面板实时回算 */
export default function RoutePlanner() {
  const { id = '' } = useParams();
  const missions = useMissionStore((s) => s.items);
  const publish = useMissionStore((s) => s.publish);
  const saveRouteParams = useMissionStore((s) => s.saveRouteParams);
  const waypoints = useWaypointStore((s) => s.items);
  const addWaypoint = useWaypointStore((s) => s.add);
  const mission = missions.find((m) => m.id === id);
  const missionWaypoints = useMemo(
    () => waypoints.filter((w) => w.missionId === id).sort((a, b) => a.seq - b.seq),
    [waypoints, id],
  );

  // 该标签页编辑时的基线版本：发布前核对，落后则打回且保留输入
  const baseVersion = useRef<{ id: string; version: number } | null>(null);
  if (mission && (baseVersion.current === null || baseVersion.current.id !== id)) {
    baseVersion.current = { id, version: mission.version };
  }
  const isStale =
    mission !== undefined && baseVersion.current !== null && mission.version !== baseVersion.current.version;

  const [params, setParams] = useState<RouteParams>({ ...DEFAULT_ROUTE_PARAMS });
  const [savedText, setSavedText] = useState('');
  const [error, setError] = useState('');
  const [staleNotice, setStaleNotice] = useState('');
  const lineId = useRef<string | null>(null);
  const metrics = useRouteMetrics(id, params);

  // 每个任务只初始化一次表单：跨标签页同步会重拉 waypoints，不能因此覆盖用户正在编辑的输入
  const initializedForId = useRef<string | null>(null);
  useEffect(() => {
    if (!id || initializedForId.current === id) return;
    if (missionWaypoints.length === 0) return; // 等航点到达后再初始化航高
    initializedForId.current = id;
    void loadFlightLine(id).then((line) => {
      if (!line) return;
      lineId.current = line.id;
      setParams((prev) => ({
        ...prev,
        altitude: missionWaypoints[0]?.altitude ?? prev.altitude,
        overlapForward: line.overlapForward,
        overlapSide: line.overlapSide,
        heading: line.heading,
      }));
      setSavedText(`上次保存：${new Date(line.updatedAt).toLocaleString('zh-CN')}`);
    });
    // missionWaypoints 仅用于初始化航高，不作为依赖以免同步时覆盖输入
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, missionWaypoints.length]);

  const buildLine = (): FlightLine => ({
    id: lineId.current ?? newId('line'),
    missionId: mission!.id,
    lineNo: 1,
    spacing: metrics.spacing,
    photoInterval: metrics.photoInterval,
    overlapForward: params.overlapForward,
    overlapSide: params.overlapSide,
    gsd: metrics.gsd,
    estPhotos: metrics.estPhotos,
    estDuration: metrics.estDuration,
    batteryCount: metrics.batteryCount,
    heading: params.heading,
    updatedAt: Date.now(),
  });

  /** 保存航线参数（核对版本）：保存后成果标待复核，导出暂停 */
  const onSave = async () => {
    if (!mission || baseVersion.current === null) return;
    const line = buildLine();
    const result = await saveRouteParams(mission.id, baseVersion.current.version, line);
    if (result.ok) {
      lineId.current = line.id;
      baseVersion.current = { id, version: result.version as number };
      setStaleNotice('');
      setSavedText(`已保存 v${result.version} · ${new Date(line.updatedAt).toLocaleString('zh-CN')} · 成果待复核`);
    } else if (result.error) {
      setStaleNotice('写入失败，已回滚：原版本、航线参数与影像质量均未改动，请重试。');
    } else {
      // 后到版本被打回：保留输入，不覆盖原内容
      setStaleNotice(
        `该任务已被其他标签页发布为 v${result.currentVersion}，您的航线参数输入已保留但未覆盖原内容。请刷新页面后重新编辑。`,
      );
    }
  };

  /** 发布新版本（核对版本）：版本 +1，解除待复核，恢复导出 */
  const onPublish = async () => {
    if (!mission || baseVersion.current === null) return;
    const line = buildLine();
    const result = await publish(mission.id, baseVersion.current.version, line);
    if (result.ok) {
      lineId.current = line.id;
      baseVersion.current = { id, version: result.version as number };
      setStaleNotice('');
      setSavedText(`已发布 v${result.version} · ${new Date(line.updatedAt).toLocaleString('zh-CN')}`);
    } else if (result.error) {
      setStaleNotice('写入失败，已回滚：原版本、航线参数与影像质量均未改动，请重试。');
    } else {
      setStaleNotice(
        `该任务已被其他标签页发布为 v${result.currentVersion}，您的航线参数输入已保留但未覆盖原内容。请刷新页面后重新编辑。`,
      );
    }
  };

  const pickPoint = async (lng: number, lat: number) => {
    if (!mission) return;
    if (missionWaypoints.length >= 60) {
      setError('单任务航点上限为 60 个，请拆分架次');
      return;
    }
    const seq = missionWaypoints.length === 0 ? 1 : Math.max(...missionWaypoints.map((w) => w.seq)) + 1;
    await addWaypoint({
      missionId: mission.id,
      seq,
      lng: Number(lng.toFixed(6)),
      lat: Number(lat.toFixed(6)),
      altitude: params.altitude,
      speed: params.speed,
      heading: params.heading,
      gimbalPitch: -90,
      action: '拍照',
      hoverSec: 0,
    });
    setError('');
  };

  const lineRows: LineRow[] = [
    { key: 'gsd', label: '地面分辨率 GSD', value: `${metrics.gsd} cm/px` },
    { key: 'spacing', label: '航线间距', value: `${metrics.spacing} m` },
    { key: 'interval', label: '拍照间隔', value: `${metrics.photoInterval} m` },
    { key: 'photos', label: '预计张数', value: `${metrics.estPhotos} 张` },
    { key: 'duration', label: '预计耗时', value: `${metrics.estDuration} min` },
    { key: 'battery', label: '预计电池组数', value: `${metrics.batteryCount} 组` },
    { key: 'area', label: '测区面积', value: `${metrics.area.toFixed(0)} m²` },
    { key: 'length', label: '航带路径长度', value: `${metrics.pathLength.toFixed(1)} m` },
    { key: 'lines', label: '预计航带数', value: `${metrics.lineCount} 条` },
  ];

  if (!mission) {
    return (
      <Space direction="vertical">
        <Alert type="warning" showIcon message="未找到该任务（可能已被删除）" />
        <Link to="/missions">返回任务台账</Link>
      </Space>
    );
  }

  return (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      <Space wrap align="center">
        <Typography.Title level={4} style={{ margin: 0 }}>
          航线规划 · {mission.missionNo}
        </Typography.Title>
        <Tag color="cyan">{mission.purpose}</Tag>
        <Tag>v{mission.version}</Tag>
        <Tag>{mission.areaName}</Tag>
        <Tag color={missionWaypoints.length > 0 ? 'green' : 'default'}>航点 {missionWaypoints.length} 个</Tag>
        <div style={{ flex: 1 }} />
        <Button type="link">
          <Link to={`/missions/${mission.id}/waypoints`}>航点明细</Link>
        </Button>
        <Button type="link">
          <Link to={`/missions/${mission.id}/assets`}>成果编目</Link>
        </Button>
        <Button type="link">
          <Link to="/settings/camera">相机预设</Link>
        </Button>
        <Button type="link">
          <Link to="/missions">返回台账</Link>
        </Button>
      </Space>

      {error ? <Alert type="error" showIcon message={error} closable onClose={() => setError('')} /> : null}
      {staleNotice ? (
        <Alert type="warning" showIcon message={staleNotice} closable onClose={() => setStaleNotice('')} />
      ) : null}
      {isStale && !staleNotice ? (
        <Alert
          type="info"
          showIcon
          message={`检测到其他标签页已将任务更新到 v${mission.version}，当前标签页仍基于 v${baseVersion.current}。发布将被打回，输入不会丢失。`}
        />
      ) : null}

      <Row gutter={14}>
        <Col span={15}>
          <Card size="small" title="测区与航线">
            <AmapRouteView
              mission={mission}
              waypoints={missionWaypoints}
              altitude={params.altitude}
              height={440}
              onPickPoint={pickPoint}
            />
          </Card>
          <Card size="small" title="航线参数明细" style={{ marginTop: 14 }}>
            <Table<LineRow>
              rowKey="key"
              size="small"
              columns={lineColumns}
              dataSource={lineRows}
              pagination={false}
            />
          </Card>
          <Card size="small" title="多架次拆分" style={{ marginTop: 14 }}>
            <Space wrap size={6}>
              {splitSorties({
                id: 'preview',
                missionId: mission.id,
                lineNo: 1,
                spacing: metrics.spacing,
                photoInterval: metrics.photoInterval,
                overlapForward: params.overlapForward,
                overlapSide: params.overlapSide,
                gsd: metrics.gsd,
                estPhotos: metrics.estPhotos,
                estDuration: metrics.estDuration,
                batteryCount: metrics.batteryCount,
                heading: params.heading,
                updatedAt: Date.now(),
              }).map((s) => (
                <Tag key={s.sortie} color="blue">
                  第 {s.sortie} 架次 · {s.photos} 张 · {s.durationMin} min
                </Tag>
              ))}
            </Space>
          </Card>
        </Col>
        <Col span={9}>
          <OverlapCalcPanel
            params={params}
            onChange={(patch) => setParams((prev) => ({ ...prev, ...patch }))}
            metrics={metrics}
            onSave={onSave}
            onPublish={onPublish}
            savedText={savedText}
          />
        </Col>
      </Row>

      <Card size="small" title="点击网格新增的航点">
        {missionWaypoints.length === 0 ? (
          <Typography.Text type="secondary">
            暂无航点：在地图/网格上单击即可按当前航高新增航点，或到「航点明细」页批量粘贴导入。
          </Typography.Text>
        ) : (
          <Space wrap size={6}>
            {missionWaypoints.map((w: Waypoint) => (
              <Tag key={w.id} color={w.action === '悬停' ? 'gold' : 'blue'}>
                #{w.seq} {w.lng.toFixed(5)}, {w.lat.toFixed(5)} · {w.altitude} m · {w.action}
              </Tag>
            ))}
          </Space>
        )}
      </Card>
    </Space>
  );
}
