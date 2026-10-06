import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Button, Card, Col, Row, Space, Table, Tag, Typography, type TableProps } from 'antd';
import { useMissionStore } from '../stores/missionStore';
import { useWaypointStore } from '../stores/waypointStore';
import { useAssetStore } from '../stores/assetStore';
import { useRouteMetrics, DEFAULT_ROUTE_PARAMS, type RouteParams } from '../hooks/useRouteMetrics';
import AmapRouteView from '../components/common/AmapRouteView';
import OverlapCalcPanel from '../components/common/OverlapCalcPanel';
import { loadFlightLine, saveFlightLine, splitSorties } from '../utils/db';
import { publishMissionChange } from '../utils/release';
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
  const applyVersion = useMissionStore((s) => s.applyVersion);
  const loadMissions = useMissionStore((s) => s.load);
  const waypoints = useWaypointStore((s) => s.items);
  const addWaypoint = useWaypointStore((s) => s.add);
  const loadWaypoints = useWaypointStore((s) => s.load);
  const markMissionPendingReview = useAssetStore((s) => s.markMissionPendingReview);
  const loadAssets = useAssetStore((s) => s.load);
  const mission = missions.find((m) => m.id === id);
  const missionWaypoints = useMemo(
    () => waypoints.filter((w) => w.missionId === id).sort((a, b) => a.seq - b.seq),
    [waypoints, id],
  );

  const [params, setParams] = useState<RouteParams>({ ...DEFAULT_ROUTE_PARAMS });
  const [savedText, setSavedText] = useState('');
  const [error, setError] = useState('');
  /** 当前编辑所基于的发布版本（保存前核对） */
  const [baseVersion, setBaseVersion] = useState(0);
  const [lineId, setLineId] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ currentVersion: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const metrics = useRouteMetrics(id, params);

  /** 进入任务时记录基线版本；他端发布后本页 baseVersion 不变，用于落后提示 */
  useEffect(() => {
    if (mission) setBaseVersion(mission.version);
    // 仅在切换任务时重置基线
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!id) return;
    void loadFlightLine(id).then((line) => {
      if (!line) return;
      setLineId(line.id);
      setParams((prev) => ({
        ...prev,
        altitude: missionWaypoints[0]?.altitude ?? prev.altitude,
        overlapForward: line.overlapForward,
        overlapSide: line.overlapSide,
        heading: line.heading,
      }));
      setSavedText(`上次保存：${new Date(line.updatedAt).toLocaleString('zh-CN')}`);
    });
  }, [id, missionWaypoints.length]);

  useEffect(() => {
    if (missionWaypoints.length > 0) {
      setParams((prev) => ({ ...prev, altitude: missionWaypoints[0].altitude }));
    }
  }, [missionWaypoints.length]);

  /** 冲突 / 失败后从库内同步最新数据（不改变本地未保存的参数输入） */
  const syncLatest = async () => {
    await Promise.all([loadMissions(), loadWaypoints(), loadAssets()]);
  };

  const onSave = async (baseOverride?: number) => {
    if (!mission || saving) return;
    const base = baseOverride ?? baseVersion;
    setSaving(true);
    const line: FlightLine = {
      id: lineId ?? newId('line'),
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
    };
    const result = await publishMissionChange({
      missionId: mission.id,
      baseVersion: base,
      source: '航线参数',
      apply: () => saveFlightLine(line),
    });
    setSaving(false);
    if (result.ok) {
      setLineId(line.id);
      setBaseVersion(result.version);
      applyVersion(mission.id, result.version);
      markMissionPendingReview(mission.id);
      setConflict(null);
      setError('');
      setSavedText(`已保存 v${result.version} · ${new Date(line.updatedAt).toLocaleString('zh-CN')}`);
      return;
    }
    if (result.reason === 'conflict') {
      // 后到版本被打回：本地参数输入保留，不覆盖先到版本
      setConflict({ currentVersion: result.currentVersion });
      void syncLatest();
      return;
    }
    setError(`写入失败，已回滚：${result.message}。原版本与成果影像质量均未改动。`);
  };

  /** 载入最新发布内容（放弃当前未保存的参数输入） */
  const reloadLatest = async () => {
    if (!mission || !conflict) return;
    await syncLatest();
    const line = await loadFlightLine(mission.id);
    if (line) {
      setLineId(line.id);
      setParams((prev) => ({
        ...prev,
        overlapForward: line.overlapForward,
        overlapSide: line.overlapSide,
        heading: line.heading,
      }));
      setSavedText(`已载入最新：${new Date(line.updatedAt).toLocaleString('zh-CN')}`);
    }
    setBaseVersion(conflict.currentVersion);
    setConflict(null);
  };

  const pickPoint = async (lng: number, lat: number) => {
    if (!mission) return;
    if (missionWaypoints.length >= 60) {
      setError('单任务航点上限为 60 个，请拆分架次');
      return;
    }
    const seq = missionWaypoints.length === 0 ? 1 : Math.max(...missionWaypoints.map((w) => w.seq)) + 1;
    const result = await addWaypoint({
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
    if (!result.ok) {
      if (result.reason === 'conflict') {
        setError(`航点未写入：该任务已在其他标签页发布 v${result.currentVersion}，本次新增被驳回且未覆盖对方内容，已为你同步最新数据`);
        void syncLatest();
      } else {
        setError(`写入失败，已回滚：${result.message}。原版本与成果影像质量均未改动。`);
      }
      return;
    }
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

  const stale = mission.version > baseVersion;

  return (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      <Space wrap align="center">
        <Typography.Title level={4} style={{ margin: 0 }}>
          航线规划 · {mission.missionNo}
        </Typography.Title>
        <Tag color="cyan">{mission.purpose}</Tag>
        <Tag>{mission.areaName}</Tag>
        <Tag color={missionWaypoints.length > 0 ? 'green' : 'default'}>航点 {missionWaypoints.length} 个</Tag>
        <Tag color="blue">版本 v{mission.version}</Tag>
        {stale ? <Tag color="orange">基于 v{baseVersion} 编辑</Tag> : null}
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

      {stale && !conflict ? (
        <Alert
          type="warning"
          showIcon
          message={`该任务已在其他标签页被修改为 v${mission.version}，你正基于 v${baseVersion} 编辑`}
          description="当前参数输入已保留；保存前会再次核对版本，若仍落后将被打回且不会覆盖对方内容。"
        />
      ) : null}

      {conflict ? (
        <Alert
          type="warning"
          showIcon
          closable
          onClose={() => setConflict(null)}
          message={`保存被驳回：该任务已先被发布为 v${conflict.currentVersion}（你基于 v${baseVersion} 编辑）`}
          description="后到版本未写入、未覆盖先到内容；你的参数输入已保留。可载入最新版本核对，或确认后以当前输入覆盖。"
          action={
            <Space direction="vertical" size={6}>
              <Button size="small" onClick={reloadLatest}>
                载入最新版本（放弃当前输入）
              </Button>
              <Button size="small" danger loading={saving} onClick={() => onSave(conflict.currentVersion)}>
                以当前输入覆盖 v{conflict.currentVersion}
              </Button>
            </Space>
          }
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
            onSave={() => void onSave()}
            saving={saving}
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
