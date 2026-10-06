import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Input,
  InputNumber,
  Modal,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Tag,
  Typography,
} from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useMissionStore } from '../stores/missionStore';
import { useWaypointStore } from '../stores/waypointStore';
import { useAssetStore } from '../stores/assetStore';
import { useMissionFilter } from '../hooks/useMissionFilter';
import MissionCard from '../components/common/MissionCard';
import { MISSION_PURPOSES, MISSION_STATUSES, type LngLat, type MissionDraft, type MissionPurpose, type MissionStatus } from '../types/mission';

const DEFAULT_POLYGON: LngLat[] = [
  [116.3912, 39.9075],
  [116.3978, 39.9075],
  [116.3978, 39.9032],
  [116.3912, 39.9032],
];

function polygonToText(polygon: LngLat[]): string {
  return polygon.map((p) => `${p[0]},${p[1]}`).join('\n');
}

function textToPolygon(text: string): LngLat[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/[,\s]+/).map(Number))
    .filter((parts) => parts.length >= 2 && parts.every((n) => Number.isFinite(n)))
    .map((parts) => [parts[0], parts[1]] as LngLat);
}

/** /missions 任务台账：按测区/机型/飞行日期筛选，显示航线数、预计张数与成果条目数 */
export default function MissionList() {
  const navigate = useNavigate();
  const missions = useMissionStore((s) => s.items);
  const addMission = useMissionStore((s) => s.add);
  const waypoints = useWaypointStore((s) => s.items);
  const assets = useAssetStore((s) => s.items);
  const { filters, patch, reset, result, options } = useMissionFilter();

  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [polygonText, setPolygonText] = useState(polygonToText(DEFAULT_POLYGON));
  const [draft, setDraft] = useState<Omit<MissionDraft, 'areaPolygon'>>({
    missionNo: '',
    name: '',
    areaName: '',
    purpose: '正射',
    droneModel: 'Mavic 3E',
    cameraModel: 'DJI 4/3 CMOS 20MP',
    sensorWidth: 17.3,
    sensorHeight: 13,
    focalLength: 12.29,
    pixelSize: 3.3,
    flightDate: new Date().toISOString().slice(0, 10),
    pilot: '',
    status: '规划中',
  });

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const stats = useMemo(
    () => ({
      missions: missions.length,
      waypoints: waypoints.length,
      assets: assets.length,
      qualified: assets.filter((a) => a.quality === '合格').length,
    }),
    [missions, waypoints, assets],
  );

  const submit = async () => {
    if (!draft.missionNo.trim()) {
      setError('任务编号必填');
      return;
    }
    if (missions.some((m) => m.missionNo === draft.missionNo.trim())) {
      setError('任务编号已存在，请更换');
      return;
    }
    const polygon = textToPolygon(polygonText);
    if (polygon.length < 3) {
      setError('测区边界至少需要 3 个经纬度点');
      return;
    }
    const created = await addMission({
      ...draft,
      missionNo: draft.missionNo.trim(),
      name: draft.name.trim() || draft.missionNo.trim(),
      areaPolygon: polygon,
    });
    setOpen(false);
    setError('');
    setToast(`已建立任务「${created.missionNo}」，测区 ${polygon.length} 个边界点`);
    setDraft({ ...draft, missionNo: '', name: '', areaName: '' });
  };

  return (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      <Space wrap align="center">
        <Typography.Title level={4} style={{ margin: 0 }}>
          任务台账
        </Typography.Title>
        <Tag>共 {missions.length} 个任务</Tag>
        <Tag color="blue">筛选命中 {result.length} 个</Tag>
        <div style={{ flex: 1 }} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          新建任务
        </Button>
      </Space>

      {toast ? <Alert type="success" showIcon message={toast} closable onClose={() => setToast('')} /> : null}

      <Row gutter={12}>
        <Col span={6}>
          <Card size="small">
            <Statistic title="任务总数" value={stats.missions} suffix="个" />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="航点总数" value={stats.waypoints} suffix="个" />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="成果影像条目" value={stats.assets} suffix="张" />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="合格影像" value={stats.qualified} suffix="张" />
          </Card>
        </Col>
      </Row>

      <Card size="small">
        <Space wrap size={12}>
          <Input
            allowClear
            style={{ width: 200 }}
            placeholder="编号 / 名称 / 飞手 / 相机"
            value={filters.keyword}
            onChange={(e) => patch({ keyword: e.target.value })}
          />
          <Select
            style={{ width: 200 }}
            value={filters.areaName}
            onChange={(v) => patch({ areaName: v })}
            options={[{ value: 'all', label: '全部测区' }, ...options.areaNames.map((v) => ({ value: v, label: v }))]}
          />
          <Select
            style={{ width: 170 }}
            value={filters.droneModel}
            onChange={(v) => patch({ droneModel: v })}
            options={[{ value: 'all', label: '全部机型' }, ...options.droneModels.map((v) => ({ value: v, label: v }))]}
          />
          <Select
            style={{ width: 140 }}
            value={filters.status}
            onChange={(v) => patch({ status: v as MissionStatus | 'all' })}
            options={[{ value: 'all', label: '全部状态' }, ...MISSION_STATUSES.map((s) => ({ value: s, label: s }))]}
          />
          <span>
            <Typography.Text type="secondary">飞行日期</Typography.Text>
            <Input
              type="date"
              style={{ width: 150, marginLeft: 6 }}
              value={filters.dateFrom}
              onChange={(e) => patch({ dateFrom: e.target.value })}
            />
            <span style={{ margin: '0 6px' }}>—</span>
            <Input
              type="date"
              style={{ width: 150 }}
              value={filters.dateTo}
              onChange={(e) => patch({ dateTo: e.target.value })}
            />
          </span>
          <Segmented
            value={filters.sortBy}
            onChange={(v) => patch({ sortBy: v as typeof filters.sortBy })}
            options={[
              { value: 'createdAt', label: '按创建时间' },
              { value: 'flightDate', label: '按飞行日期' },
              { value: 'missionNo', label: '按编号' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={reset}>
            重置
          </Button>
        </Space>
      </Card>

      {result.length === 0 ? (
        <Empty description="没有符合条件的任务" />
      ) : (
        <Row gutter={[12, 12]}>
          {result.map((row) => (
            <Col key={row.mission.id} xs={24} xl={12}>
              <MissionCard
                mission={row.mission}
                waypointCount={row.waypointCount}
                assetCount={row.assetCount}
                lineCount={row.waypointCount > 1 ? 1 : 0}
                footer={
                  <Space wrap size={4}>
                    <Button size="small" type="link" onClick={() => navigate(`/missions/${row.mission.id}/route`)}>
                      航线规划
                    </Button>
                    <Button size="small" type="link" onClick={() => navigate(`/missions/${row.mission.id}/waypoints`)}>
                      航点明细
                    </Button>
                    <Button size="small" type="link" onClick={() => navigate(`/missions/${row.mission.id}/assets`)}>
                      成果编目
                    </Button>
                    <Button size="small" type="link" onClick={() => navigate('/settings/camera')}>
                      相机预设
                    </Button>
                  </Space>
                }
              />
            </Col>
          ))}
        </Row>
      )}

      <Modal open={open} title="新建航拍任务" width={720} onCancel={() => setOpen(false)} onOk={submit} okText="保存任务">
        <Space direction="vertical" size={10} style={{ width: '100%', marginTop: 8 }}>
          {error ? <Alert type="error" showIcon message={error} /> : null}
          <Space wrap size={10}>
            <Input
              style={{ width: 200 }}
              placeholder="任务编号，如 DM-2024-030"
              value={draft.missionNo}
              onChange={(e) => setDraft({ ...draft, missionNo: e.target.value })}
            />
            <Input
              style={{ width: 260 }}
              placeholder="任务名称"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <Input
              style={{ width: 200 }}
              placeholder="测区名称"
              value={draft.areaName}
              onChange={(e) => setDraft({ ...draft, areaName: e.target.value })}
            />
          </Space>
          <Space wrap size={10}>
            <Select
              style={{ width: 130 }}
              value={draft.purpose}
              onChange={(v) => setDraft({ ...draft, purpose: v as MissionPurpose })}
              options={MISSION_PURPOSES.map((p) => ({ value: p, label: p }))}
            />
            <Input
              style={{ width: 160 }}
              placeholder="机型"
              value={draft.droneModel}
              onChange={(e) => setDraft({ ...draft, droneModel: e.target.value })}
            />
            <Input
              style={{ width: 200 }}
              placeholder="相机型号"
              value={draft.cameraModel}
              onChange={(e) => setDraft({ ...draft, cameraModel: e.target.value })}
            />
          </Space>
          <Space wrap size={10}>
            <span>
              传感器宽 mm{' '}
              <InputNumber value={draft.sensorWidth} step={0.1} onChange={(v) => setDraft({ ...draft, sensorWidth: Number(v) })} />
            </span>
            <span>
              高 mm{' '}
              <InputNumber value={draft.sensorHeight} step={0.1} onChange={(v) => setDraft({ ...draft, sensorHeight: Number(v) })} />
            </span>
            <span>
              焦距 mm{' '}
              <InputNumber value={draft.focalLength} step={0.01} onChange={(v) => setDraft({ ...draft, focalLength: Number(v) })} />
            </span>
            <span>
              像元 μm{' '}
              <InputNumber value={draft.pixelSize} step={0.1} onChange={(v) => setDraft({ ...draft, pixelSize: Number(v) })} />
            </span>
          </Space>
          <Space wrap size={10}>
            <span>
              飞行日期{' '}
              <Input
                type="date"
                style={{ width: 160 }}
                value={draft.flightDate}
                onChange={(e) => setDraft({ ...draft, flightDate: e.target.value })}
              />
            </span>
            <Input
              style={{ width: 160 }}
              placeholder="飞手"
              value={draft.pilot}
              onChange={(e) => setDraft({ ...draft, pilot: e.target.value })}
            />
            <Select
              style={{ width: 130 }}
              value={draft.status}
              onChange={(v) => setDraft({ ...draft, status: v as MissionStatus })}
              options={MISSION_STATUSES.map((s) => ({ value: s, label: s }))}
            />
          </Space>
          <div>
            <Typography.Text type="secondary">测区边界经纬度（每行一点：经度,纬度）</Typography.Text>
            <Input.TextArea rows={5} value={polygonText} onChange={(e) => setPolygonText(e.target.value)} />
          </div>
        </Space>
      </Modal>
    </Space>
  );
}
