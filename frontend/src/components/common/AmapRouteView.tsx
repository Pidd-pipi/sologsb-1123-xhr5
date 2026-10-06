import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Space, Tag, Typography } from 'antd';
import type { LngLat, Mission } from '../../types/mission';
import type { Waypoint } from '../../types/waypoint';
import { createProjector, distanceMeters, groundCoverage } from '../../utils/geoCalc';
import { loadAmap, readAmapKey, type AMapNamespace } from '../../utils/amapLoader';

export interface AmapRouteViewProps {
  mission?: Mission;
  waypoints: Waypoint[];
  /** 相对航高 m，用于绘制每航点视场矩形 */
  altitude: number;
  /** 画布高度 px */
  height?: number;
  /** 点击网格新增航点时回调（仅 SVG 视图支持） */
  onPickPoint?: (lng: number, lat: number) => void;
  /** 高亮的航点序号（例如从成果编目页「定位到图」） */
  highlightSeq?: number;
  /** 航点标注（用于单点视场预览） */
  withFov?: boolean;
}

const GRID_W = 760;

/**
 * 高德地图封装：绘制测区多边形、航点折线、每航点视场矩形。
 * 读取 `VITE_AMAP_KEY`；未配置 key 时自动退化为本地 SVG 网格视图（等比投影，功能不依赖网络）。
 * 被航线规划页、成果编目页消费。
 */
export default function AmapRouteView({
  mission,
  waypoints,
  altitude,
  height = 420,
  onPickPoint,
  highlightSeq,
  withFov = true,
}: AmapRouteViewProps) {
  const [amap, setAmap] = useState<AMapNamespace | null>(null);
  const [mode, setMode] = useState<'loading' | 'amap' | 'grid'>('loading');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<{ destroy: () => void } | null>(null);
  const keyPresent = readAmapKey().length > 0;

  useEffect(() => {
    let alive = true;
    if (!keyPresent) {
      setMode('grid');
      return () => {
        alive = false;
      };
    }
    loadAmap().then((ns) => {
      if (!alive) return;
      if (ns) {
        setAmap(ns);
        setMode('amap');
      } else {
        // key 配置了但脚本加载失败 → 依然退化为本地网格视图，不阻塞功能
        setMode('grid');
      }
    });
    return () => {
      alive = false;
    };
  }, [keyPresent]);

  // 高德地图分支：绘制多边形 / 折线 / 航点 / 视场矩形
  useEffect(() => {
    if (mode !== 'amap' || !amap || !containerRef.current || !mission) return;
    const container = containerRef.current;
    const map = new amap.Map(container, {
      zoom: 15,
      center: mission.areaPolygon[0] ?? [116.39, 39.9],
      mapStyle: 'amap://styles/normal',
    });
    mapRef.current = map;
    const overlays: unknown[] = [];
    if (mission.areaPolygon.length >= 3) {
      overlays.push(
        new amap.Polygon({
          path: mission.areaPolygon,
          strokeColor: '#1d3557',
          strokeWeight: 2,
          fillColor: '#8ecae6',
          fillOpacity: 0.25,
        }),
      );
    }
    if (waypoints.length >= 2) {
      overlays.push(
        new amap.Polyline({
          path: waypoints.map((w) => [w.lng, w.lat]),
          strokeColor: '#e07a2f',
          strokeWeight: 3,
        }),
      );
    }
    waypoints.forEach((w) => {
      overlays.push(
        new amap.Marker({
          position: [w.lng, w.lat],
          title: `#${w.seq} ${w.altitude} m ${w.action}`,
        }),
      );
      if (withFov) {
        const side = groundCoverage(mission.sensorWidth, w.altitude, mission.focalLength);
        const along = groundCoverage(mission.sensorHeight, w.altitude, mission.focalLength);
        const dLat = side / 111320 / 2;
        const dLng = along / (111320 * Math.cos((w.lat * Math.PI) / 180)) / 2;
        overlays.push(
          new amap.Rectangle({
            bounds: [
              [w.lng - dLng, w.lat - dLat],
              [w.lng + dLng, w.lat + dLat],
            ],
            strokeColor: '#e07a2f',
            strokeWeight: 1,
            fillColor: '#e07a2f',
            fillOpacity: 0.12,
          }),
        );
      }
    });
    overlays.forEach((o) => map.add(o));
    map.setFitView();
    return () => {
      try {
        map.destroy();
      } catch {
        /* 忽略销毁异常 */
      }
      mapRef.current = null;
    };
  }, [mode, amap, mission, waypoints, withFov]);

  // 本地 SVG 网格视图：等比投影，完全离线
  const projection = useMemo(() => {
    const poly: LngLat[] = mission && mission.areaPolygon.length >= 3 ? mission.areaPolygon : [[116.391, 39.907], [116.398, 39.907], [116.398, 39.903], [116.391, 39.903]];
    const all: LngLat[] = [...poly, ...waypoints.map((w) => [w.lng, w.lat] as LngLat)];
    const lngs = all.map((p) => p[0]);
    const lats = all.map((p) => p[1]);
    const box: LngLat[] = [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
      [Math.min(...lngs), Math.max(...lats)],
    ];
    return { poly, box, projector: createProjector(box, GRID_W, height) };
  }, [mission, waypoints, height]);

  const pxPerMeter = useMemo(() => {
    const { box, projector } = projection;
    const dMeters = distanceMeters(box[0], box[1]) || 1;
    const a = projector.toXY(box[0]);
    const b = projector.toXY(box[1]);
    return Math.hypot(b.x - a.x, b.y - a.y) / dMeters;
  }, [projection]);

  const fovRects = useMemo(() => {
    if (!withFov || !mission) return [];
    return waypoints.map((w) => {
      const sideM = groundCoverage(mission.sensorWidth, w.altitude, mission.focalLength);
      const alongM = groundCoverage(mission.sensorHeight, w.altitude, mission.focalLength);
      const p = projection.projector.toXY([w.lng, w.lat]);
      return {
        id: w.id,
        seq: w.seq,
        x: p.x - (alongM * pxPerMeter) / 2,
        y: p.y - (sideM * pxPerMeter) / 2,
        w: alongM * pxPerMeter,
        h: sideM * pxPerMeter,
      };
    });
  }, [withFov, mission, waypoints, projection, pxPerMeter]);

  if (mode === 'loading') {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e5e7eb', borderRadius: 6 }}>
        <Typography.Text type="secondary">正在加载地图视图…</Typography.Text>
      </div>
    );
  }

  if (mode === 'amap') {
    return (
      <div>
        <Alert
          style={{ marginBottom: 8 }}
          type="success"
          showIcon
          message="已启用高德地图 JS API（VITE_AMAP_KEY 已配置）"
        />
        <div ref={containerRef} style={{ width: '100%', height, borderRadius: 6, overflow: 'hidden' }} data-testid="amap-container" />
      </div>
    );
  }

  const polygonPath = projection.poly.map((p) => projection.projector.toXY(p)).map((p) => `${p.x},${p.y}`).join(' ');
  const linePath = waypoints.map((w) => projection.projector.toXY([w.lng, w.lat]));

  return (
    <div data-testid="amap-fallback-grid">
      <Alert
        style={{ marginBottom: 8 }}
        type="info"
        showIcon
        message="未配置 VITE_AMAP_KEY，已自动退化为本地 SVG 网格视图（等比投影，航线与视场仍可绘制交互，功能不依赖网络）"
      />
      <svg
        viewBox={`0 0 ${GRID_W} ${height}`}
        width="100%"
        height={height}
        style={{ border: '1px solid #dbe1e8', borderRadius: 6, background: '#fbfdfe', cursor: onPickPoint ? 'crosshair' : 'default' }}
        onClick={(e) => {
          if (!onPickPoint) return;
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * GRID_W;
          const y = ((e.clientY - rect.top) / rect.height) * height;
          const [lng, lat] = projection.projector.toLngLat(x, y);
          onPickPoint(lng, lat);
        }}
      >
        <defs>
          <pattern id="grid-10" width="38" height="38" patternUnits="userSpaceOnUse">
            <path d="M38 0 L0 0 0 38" fill="none" stroke="#e8eef4" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={GRID_W} height={height} fill="url(#grid-10)" />

        {fovRects.map((r) => (
          <rect
            key={`fov-${r.id}`}
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            fill="#e07a2f"
            fillOpacity={r.seq === highlightSeq ? 0.3 : 0.12}
            stroke="#e07a2f"
            strokeWidth={r.seq === highlightSeq ? 2 : 1}
          />
        ))}

        {polygonPath ? (
          <polygon points={polygonPath} fill="#8ecae6" fillOpacity="0.25" stroke="#1d3557" strokeWidth="2" />
        ) : null}

        {linePath.length >= 2 ? (
          <polyline
            points={linePath.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#e07a2f"
            strokeWidth="2.5"
          />
        ) : null}

        {waypoints.map((w) => {
          const p = projection.projector.toXY([w.lng, w.lat]);
          const active = w.seq === highlightSeq;
          return (
            <g key={w.id}>
              <circle cx={p.x} cy={p.y} r={active ? 8 : 5} fill={active ? '#d93025' : '#1d3557'} />
              <text x={p.x + 9} y={p.y - 6} fontSize="11" fill="#3c4652">
                #{w.seq} {w.altitude}m {w.action}
              </text>
            </g>
          );
        })}

        <g>
          <line x1="24" y1={height - 22} x2="124" y2={height - 22} stroke="#333" strokeWidth="2" />
          <text x="30" y={height - 28} fontSize="11" fill="#333">
            比例尺 100 m
          </text>
        </g>
      </svg>
      <Space size={6} style={{ marginTop: 8 }} wrap>
        <Tag color="blue">测区边界</Tag>
        <Tag color="orange">航点折线（{waypoints.length} 点）</Tag>
        <Tag>每航点视场矩形</Tag>
        <Tag color="gold">1 px ≈ {pxPerMeter > 0 ? (1 / pxPerMeter).toFixed(1) : '—'} m</Tag>
        {onPickPoint ? <Tag color="green">点击网格可新增航点</Tag> : null}
      </Space>
    </div>
  );
}
