import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  type TableProps,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useMissionStore } from '../stores/missionStore';
import OverlapCalcPanel from '../components/common/OverlapCalcPanel';
import { useRouteMetrics, DEFAULT_ROUTE_PARAMS, type RouteParams } from '../hooks/useRouteMetrics';
import type { CameraPreset as CameraPresetModel } from '../types/mission';

type Columns = NonNullable<TableProps<CameraPresetModel>['columns']>;

/** /settings/camera 相机与传感器参数预设管理，选定预设后自动带入任务 */
export default function CameraPreset() {
  const missions = useMissionStore((s) => s.items);
  const presets = useMissionStore((s) => s.presets);
  const addPreset = useMissionStore((s) => s.addPreset);
  const removePreset = useMissionStore((s) => s.removePreset);
  const applyPreset = useMissionStore((s) => s.applyPreset);

  const [missionId, setMissionId] = useState('');
  const [presetId, setPresetId] = useState('');
  const [params, setParams] = useState<RouteParams>({ ...DEFAULT_ROUTE_PARAMS });
  const [draft, setDraft] = useState<Omit<CameraPresetModel, 'id'>>({
    name: '',
    cameraModel: '',
    sensorWidth: 13.2,
    sensorHeight: 8.8,
    focalLength: 8.8,
    pixelSize: 2.4,
  });
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!missionId && missions.length > 0) setMissionId(missions[0].id);
    if (!presetId && presets.length > 0) setPresetId(presets[0].id);
  }, [missions, presets, missionId, presetId]);

  const metrics = useRouteMetrics(missionId, params);
  const selectedMission = missions.find((m) => m.id === missionId);

  const columns: Columns = [
    { title: '预设名', dataIndex: 'name', width: 170 },
    { title: '相机型号', dataIndex: 'cameraModel', width: 200 },
    {
      title: '传感器 mm',
      width: 150,
      render: (_: unknown, row: CameraPresetModel) => `${row.sensorWidth} × ${row.sensorHeight}`,
    },
    { title: '焦距 mm', dataIndex: 'focalLength', width: 100 },
    { title: '像元 μm', dataIndex: 'pixelSize', width: 100 },
    {
      title: '120 m 航高 GSD',
      width: 150,
      render: (_: unknown, row: CameraPresetModel) =>
        `${Math.round(((row.pixelSize * 120) / (row.focalLength * 10)) * 100) / 100} cm/px`,
    },
    {
      title: '操作',
      width: 200,
      render: (_: unknown, row: CameraPresetModel) => (
        <Space size={4}>
          <Button
            size="small"
            type="primary"
            ghost
            disabled={!missionId}
            onClick={async () => {
              await applyPreset(missionId, row.id);
              setToast(`已把预设「${row.name}」带入 ${selectedMission?.missionNo ?? ''}`);
            }}
          >
            带入任务
          </Button>
          <Button size="small" danger onClick={() => removePreset(row.id)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      <Space wrap align="center">
        <Typography.Title level={4} style={{ margin: 0 }}>
          相机与传感器参数预设
        </Typography.Title>
        <Tag>预设 {presets.length} 套</Tag>
        <Tag color="blue">任务 {missions.length} 个</Tag>
        <div style={{ flex: 1 }} />
        <Button type="link">
          <Link to="/missions">返回任务台账</Link>
        </Button>
      </Space>

      {toast ? <Alert type="success" showIcon message={toast} closable onClose={() => setToast('')} /> : null}
      {error ? <Alert type="error" showIcon message={error} closable onClose={() => setError('')} /> : null}

      <Row gutter={14}>
        <Col span={15}>
          <Card size="small" title="预设清单">
            <Table<CameraPresetModel>
              rowKey="id"
              size="small"
              columns={columns}
              dataSource={presets}
              pagination={false}
              locale={{ emptyText: '暂无相机预设' }}
            />
          </Card>

          <Card size="small" title="新增预设" style={{ marginTop: 14 }}>
            <Space wrap size={10}>
              <Input
                style={{ width: 170 }}
                placeholder="预设名"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
              <Input
                style={{ width: 200 }}
                placeholder="相机型号"
                value={draft.cameraModel}
                onChange={(e) => setDraft({ ...draft, cameraModel: e.target.value })}
              />
              <span>
                传感器宽{' '}
                <InputNumber value={draft.sensorWidth} step={0.1} onChange={(v) => setDraft({ ...draft, sensorWidth: Number(v) })} />
              </span>
              <span>
                高 <InputNumber value={draft.sensorHeight} step={0.1} onChange={(v) => setDraft({ ...draft, sensorHeight: Number(v) })} />
              </span>
              <span>
                焦距 <InputNumber value={draft.focalLength} step={0.01} onChange={(v) => setDraft({ ...draft, focalLength: Number(v) })} />
              </span>
              <span>
                像元 <InputNumber value={draft.pixelSize} step={0.1} onChange={(v) => setDraft({ ...draft, pixelSize: Number(v) })} />
              </span>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={async () => {
                  if (!draft.name.trim() || !draft.cameraModel.trim()) {
                    setError('预设名与相机型号必填');
                    return;
                  }
                  await addPreset({ ...draft, name: draft.name.trim(), cameraModel: draft.cameraModel.trim() });
                  setError('');
                  setToast(`已新增预设「${draft.name.trim()}」`);
                  setDraft({ ...draft, name: '', cameraModel: '' });
                }}
              >
                保存预设
              </Button>
            </Space>
          </Card>

          <Card size="small" title="带入到任务" style={{ marginTop: 14 }}>
            <Space wrap size={10}>
              <Select
                style={{ width: 260 }}
                placeholder="选择任务"
                value={missionId || undefined}
                onChange={setMissionId}
                options={missions.map((m) => ({ value: m.id, label: `${m.missionNo} · ${m.areaName}` }))}
              />
              <Select
                style={{ width: 220 }}
                placeholder="选择预设"
                value={presetId || undefined}
                onChange={setPresetId}
                options={presets.map((p) => ({ value: p.id, label: p.name }))}
              />
              <Button
                type="primary"
                disabled={!missionId || !presetId}
                onClick={async () => {
                  await applyPreset(missionId, presetId);
                  const preset = presets.find((p) => p.id === presetId);
                  setToast(`已把「${preset?.name ?? ''}」的焦距/像元/传感器带入任务`);
                }}
              >
                带入任务
              </Button>
            </Space>
            {selectedMission ? (
              <Typography.Paragraph type="secondary" style={{ marginTop: 10, marginBottom: 0 }}>
                当前任务传感器：{selectedMission.sensorWidth} × {selectedMission.sensorHeight} mm / f
                {selectedMission.focalLength} mm / {selectedMission.pixelSize} μm
              </Typography.Paragraph>
            ) : null}
          </Card>
        </Col>

        <Col span={9}>
          <OverlapCalcPanel
            params={params}
            onChange={(patch) => setParams((prev) => ({ ...prev, ...patch }))}
            metrics={metrics}
          />
        </Col>
      </Row>
    </Space>
  );
}
